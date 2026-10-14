package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

/**
 * One line of the wallet audit log: a recharge or manual deduction by the super admin, a charge for a send or an
 * Inbox reply, a refund for messages that failed or were cancelled, or a change of the per-message prices.
 */
@Document("wallet_txns")
@Getter @Setter
public class WalletTxn implements Sequenced {

    public static final String RECHARGE = "RECHARGE", DEDUCT = "DEDUCT", SEND = "SEND", REPLY = "REPLY",
            REFUND = "REFUND", RATES = "RATES";

    @Id
    private Long id;
    /** Whose wallet (admin username). */
    @Indexed
    private String admin;
    private String type;
    /** Signed amount in paise: + money in (recharge, refund), - money out (send, reply, deduction). */
    private long amountPaise;
    /** Wallet balance after this line, in paise. */
    private long balanceAfterPaise;
    private String channel;
    private Long campaignId;
    private String campaignName;
    /** Messages charged or refunded. */
    private int messages;
    /** Price per message at the time, in paise. */
    private long ratePaise;
    private String note;
    /** Who did it (super admin for recharges, the admin for sends). */
    private String by;
    @Indexed
    private LocalDateTime at = LocalDateTime.now();
}
