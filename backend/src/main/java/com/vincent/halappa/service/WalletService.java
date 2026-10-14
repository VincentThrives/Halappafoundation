package com.vincent.halappa.service;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.common.PageDto;
import com.vincent.halappa.domain.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Admin wallets: the super admin recharges them and sets the price per message; sends take the money out first
 * (all of it, before anything goes out) and failed/cancelled messages are refunded when the send ends.
 * Every movement is a {@link WalletTxn} line in the audit log. Amounts are paise (whole numbers).
 */
@Service
@RequiredArgsConstructor
public class WalletService {

    /** Largest single recharge/deduction: ₹10,00,000. */
    static final long MAX_AMOUNT_PAISE = 10_00_000L * 100;

    private final AdminUserRepository admins;
    private final WalletTxnRepository txns;
    private final WalletRatesRepository ratesRepo;
    private final MongoTemplate mongo;

    public record Admin(String username, String role, long walletPaise) {}

    // ---------- prices ----------

    public WalletRates rates() { return ratesRepo.findById(WalletRates.ID).orElseGet(WalletRates::new); }

    public WalletRates setRates(long whatsappPaise, long smsPaise, long emailPaise, String by) {
        for (long p : new long[] { whatsappPaise, smsPaise, emailPaise })
            if (p < 0 || p > 100_00) throw ApiException.badRequest("Each price must be between ₹0 and ₹100 per message");
        WalletRates r = rates();
        r.setWhatsappPaise(whatsappPaise);
        r.setSmsPaise(smsPaise);
        r.setEmailPaise(emailPaise);
        r.setUpdatedBy(by);
        r.setUpdatedAt(LocalDateTime.now());
        ratesRepo.save(r);
        WalletTxn t = new WalletTxn();
        t.setType(WalletTxn.RATES);
        t.setAdmin("-");
        t.setBy(by);
        t.setNote("Prices per message: WhatsApp " + rupees(whatsappPaise) + ", SMS " + rupees(smsPaise) + ", Email " + rupees(emailPaise));
        txns.save(t);
        return r;
    }

    // ---------- balances ----------

    public List<Admin> admins() {
        return admins.findAllByOrderByUsernameAsc().stream()
                .map(a -> new Admin(a.getUsername(), a.roleOrDefault(), a.getWalletPaise())).toList();
    }

    public long balance(String admin) { return user(admin).getWalletPaise(); }

    /** Super admin adds money to an admin's wallet. */
    public WalletTxn recharge(String admin, long paise, String note, String by) {
        if (paise <= 0 || paise > MAX_AMOUNT_PAISE) throw ApiException.badRequest("Enter an amount between ₹0.01 and ₹10,00,000");
        AdminUser u = user(admin);
        if (u.superAdmin()) throw ApiException.badRequest("The super admin doesn't have a wallet");
        AdminUser after = mongo.findAndModify(Query.query(Criteria.where("username").is(admin)),
                new Update().inc("walletPaise", paise), FindAndModifyOptions.options().returnNew(true), AdminUser.class);
        return log(admin, WalletTxn.RECHARGE, paise, after.getWalletPaise(), null, null, null, 0, 0, note, by);
    }

    /** Super admin takes money out (corrections). Refused if the wallet doesn't have it. */
    public WalletTxn deduct(String admin, long paise, String note, String by) {
        if (paise <= 0 || paise > MAX_AMOUNT_PAISE) throw ApiException.badRequest("Enter an amount between ₹0.01 and ₹10,00,000");
        AdminUser u = user(admin);
        if (u.superAdmin()) throw ApiException.badRequest("The super admin doesn't have a wallet");
        AdminUser after = take(admin, paise);
        if (after == null) throw ApiException.badRequest("The wallet has only " + rupees(u.getWalletPaise()) + "; can't deduct " + rupees(paise));
        return log(admin, WalletTxn.DEDUCT, -paise, after.getWalletPaise(), null, null, null, 0, 0, note, by);
    }

    // ---------- sends ----------

    /** Price of a send for this admin right now (0 for the super admin or when the price is ₹0). */
    public long ratePaise(String admin, String channel) {
        AdminUser u = admins.findByUsername(admin == null ? "" : admin).orElse(null);
        return u == null || u.superAdmin() ? 0 : rates().forChannel(channel);
    }

    /**
     * Takes payment for a whole send before anything goes out, and records it on the campaign.
     * Refuses (nothing taken) when the wallet doesn't cover it. Super admin sends are logged but not charged.
     */
    public void chargeSend(Campaign c, String admin, int count) {
        AdminUser u = user(admin);
        long rate = u.superAdmin() ? 0 : rates().forChannel(c.getChannel());
        long cost = rate * count;
        long balanceAfter = u.getWalletPaise();
        if (cost > 0) {
            AdminUser after = take(admin, cost);
            if (after == null) throw ApiException.badRequest("Not enough balance in the wallet: this send costs " + rupees(cost)
                    + " (" + count + " × " + rupees(rate) + ") and the wallet has " + rupees(u.getWalletPaise())
                    + ". Ask Vincent Thrives to recharge.");
            balanceAfter = after.getWalletPaise();
        }
        c.setChargedTo(u.superAdmin() ? null : admin);
        c.setRatePaise(rate);
        c.setChargedCount(c.getChargedCount() + count);
        log(admin, WalletTxn.SEND, -cost, balanceAfter, c.getChannel(), c.getId(), c.getName(), count, rate,
                u.superAdmin() ? "Super admin send (not charged)" : rate == 0 ? "Free: price is ₹0" : null, admin);
    }

    /**
     * Refunds messages that were paid for but not sent (failed or cancelled). Safe to call any number of times:
     * it only returns what hasn't been returned yet.
     */
    public void settle(Campaign c) {
        if (c.getChargedTo() == null || c.getRatePaise() <= 0) return;
        long unsent = countMessages(c.getId(), List.of("failed", "cancelled"));
        long paidFor = c.getChargedCount() - c.getRefundedCount();
        long shouldBePaid = c.getTotal() - unsent;
        int refund = (int) Math.max(0, paidFor - shouldBePaid);
        if (refund == 0) return;
        long amount = refund * c.getRatePaise();
        AdminUser after = mongo.findAndModify(Query.query(Criteria.where("username").is(c.getChargedTo())),
                new Update().inc("walletPaise", amount), FindAndModifyOptions.options().returnNew(true), AdminUser.class);
        c.setRefundedCount(c.getRefundedCount() + refund);
        mongo.save(c);
        if (after != null)
            log(c.getChargedTo(), WalletTxn.REFUND, amount, after.getWalletPaise(), c.getChannel(), c.getId(), c.getName(),
                    refund, c.getRatePaise(), "Not sent (failed or cancelled)", "system");
    }

    /** One Inbox reply: charged before sending; returns the amount, to refund if the send fails. */
    public long chargeReply(String admin, String channel, String contact) {
        if (admin == null) return 0;
        AdminUser u = user(admin);
        long rate = u.superAdmin() ? 0 : rates().forChannel(channel);
        long balanceAfter = u.getWalletPaise();
        if (rate > 0) {
            AdminUser after = take(admin, rate);
            if (after == null) throw ApiException.badRequest("Not enough balance in the wallet for this reply (" + rupees(rate)
                    + "); the wallet has " + rupees(u.getWalletPaise()) + ". Ask Vincent Thrives to recharge.");
            balanceAfter = after.getWalletPaise();
        }
        log(admin, WalletTxn.REPLY, -rate, balanceAfter, channel, null, null, 1, rate, "Reply to " + contact, admin);
        return rate;
    }

    public void refundReply(String admin, String channel, String contact, long amount) {
        if (admin == null || amount <= 0) return;
        AdminUser after = mongo.findAndModify(Query.query(Criteria.where("username").is(admin)),
                new Update().inc("walletPaise", amount), FindAndModifyOptions.options().returnNew(true), AdminUser.class);
        if (after != null) log(admin, WalletTxn.REFUND, amount, after.getWalletPaise(), channel, null, null, 1, amount,
                "Reply to " + contact + " was not sent", "system");
    }

    // ---------- audit log ----------

    public PageDto<WalletTxn> log(String admin, String type, LocalDate from, LocalDate to, int page, int size) {
        List<Criteria> and = new ArrayList<>();
        if (admin != null && !admin.isBlank()) and.add(Criteria.where("admin").is(admin.trim()));
        if (type != null && !type.isBlank()) and.add(Criteria.where("type").is(type.trim().toUpperCase(Locale.ROOT)));
        if (from != null) and.add(Criteria.where("at").gte(from.atStartOfDay()));
        if (to != null) and.add(Criteria.where("at").lt(to.plusDays(1).atStartOfDay()));
        Query q = and.isEmpty() ? new Query() : Query.query(new Criteria().andOperator(and.toArray(new Criteria[0])));
        long total = mongo.count(q, WalletTxn.class);
        int sz = Math.max(1, Math.min(size, 200));
        q.with(PageRequest.of(Math.max(0, page), sz, Sort.by(Sort.Direction.DESC, "_id")));
        return new PageDto<>(mongo.find(q, WalletTxn.class), total, page, sz);
    }

    // ---------- helpers ----------

    /** "12.50" or "₹12.50" → 1250 paise. */
    public static long toPaise(String rupees) {
        if (rupees == null || rupees.isBlank()) throw ApiException.badRequest("Enter an amount");
        try {
            BigDecimal v = new BigDecimal(rupees.trim().replace("₹", "").replace(",", ""));
            if (v.scale() > 2) throw ApiException.badRequest("Use at most 2 decimals (paise)");
            return v.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.UNNECESSARY).longValueExact();
        } catch (NumberFormatException | ArithmeticException e) {
            throw ApiException.badRequest("Enter the amount in rupees, e.g. 500 or 0.80");
        }
    }

    public static String rupees(long paise) {
        return "₹" + BigDecimal.valueOf(paise).movePointLeft(2).setScale(2, RoundingMode.UNNECESSARY).toPlainString();
    }

    private AdminUser user(String admin) {
        return admins.findByUsername(admin == null ? "" : admin.trim()).orElseThrow(() -> ApiException.notFound("Admin"));
    }

    /** Atomically takes paise only if the balance covers it; null when it doesn't. */
    private AdminUser take(String admin, long paise) {
        return mongo.findAndModify(Query.query(Criteria.where("username").is(admin).and("walletPaise").gte(paise)),
                new Update().inc("walletPaise", -paise), FindAndModifyOptions.options().returnNew(true), AdminUser.class);
    }

    private long countMessages(Long campaignId, List<String> statuses) {
        return mongo.count(Query.query(Criteria.where("campaignId").is(campaignId).and("status").in(statuses)), Message.class);
    }

    private WalletTxn log(String admin, String type, long amount, long balanceAfter, String channel, Long campaignId,
                          String campaignName, int messages, long rate, String note, String by) {
        WalletTxn t = new WalletTxn();
        t.setAdmin(admin);
        t.setType(type);
        t.setAmountPaise(amount);
        t.setBalanceAfterPaise(balanceAfter);
        t.setChannel(channel);
        t.setCampaignId(campaignId);
        t.setCampaignName(campaignName);
        t.setMessages(messages);
        t.setRatePaise(rate);
        t.setNote(note == null || note.isBlank() ? null : note.trim().length() > 300 ? note.trim().substring(0, 300) : note.trim());
        t.setBy(by);
        return txns.save(t);
    }
}
