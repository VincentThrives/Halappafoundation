package com.vincent.halappa.service;

import com.vincent.halappa.domain.Campaign;
import com.vincent.halappa.domain.CampaignRepository;
import com.vincent.halappa.domain.Message;
import com.vincent.halappa.domain.MessageRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Works through a campaign's queued messages in the background, 100 at a time, re-reading the
 * campaign between batches so Pause/Cancel take effect quickly. Progress lives in the database,
 * so a restart simply picks up the remaining queued messages.
 */
@Slf4j
@Component
public class CampaignRunner {

    private final CampaignRepository campaigns;
    private final MessageRepository messages;
    private final WhatsAppService whatsapp;
    private final MailService mail;
    private final SmsService sms;
    private final TaskExecutor executor;
    private final Set<Long> active = ConcurrentHashMap.newKeySet();

    @Value("${app.campaign.whatsapp-delay-ms:60}") long whatsappDelay;
    @Value("${app.campaign.email-delay-ms:300}") long emailDelay;
    @Value("${app.campaign.sms-batch:100}") int smsBatch;

    public CampaignRunner(CampaignRepository campaigns, MessageRepository messages, WhatsAppService whatsapp,
                          MailService mail, SmsService sms,
                          @org.springframework.beans.factory.annotation.Qualifier("applicationTaskExecutor") TaskExecutor applicationTaskExecutor) {
        this.campaigns = campaigns;
        this.messages = messages;
        this.whatsapp = whatsapp;
        this.mail = mail;
        this.sms = sms;
        this.executor = applicationTaskExecutor;
    }

    /** Starts once the surrounding transaction has committed (so the queued rows are visible). */
    public void startAfterCommit(Long id) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { start(id); }
            });
        } else start(id);
    }

    public void start(Long id) {
        if (!active.add(id)) return; // already running
        executor.execute(() -> {
            try { run(id); }
            catch (Exception e) { log.error("Campaign #{} stopped unexpectedly", id, e); }
            finally { active.remove(id); }
        });
    }

    public boolean isActive(Long id) { return active.contains(id); }

    void run(Long id) {
        while (true) {
            Campaign c = campaigns.findById(id).orElse(null);
            if (c == null || !"running".equals(c.getStatus())) return;
            List<Message> batch = messages.findTop100ByCampaignIdAndStatusOrderByIdAsc(id, "queued");
            if (batch.isEmpty()) {
                c.setStatus("done");
                c.setFinishedAt(LocalDateTime.now());
                campaigns.save(c);
                log.info("Campaign #{} finished", id);
                return;
            }
            switch (c.getChannel()) {
                case "sms" -> sendSms(batch);
                case "email" -> batch.forEach(m -> { sendEmail(m); pause(emailDelay); });
                default -> {
                    for (Message m : batch) {
                        sendWhatsApp(c, m);
                        pause(whatsappDelay);
                    }
                }
            }
        }
    }

    private void sendWhatsApp(Campaign c, Message m) {
        try {
            List<String> params = new ArrayList<>();
            if (c.getTemplate() != null) {
                params.add(m.getName() == null || m.getName().isBlank() ? "Friend" : m.getName());
                if (m.getVoucher() != null) params.add(m.getVoucher());
            }
            String id = whatsapp.send(m.getContact(), m.getBody(), c.getTemplate(), c.getTemplateLang(), params);
            done(m, "sent", id, null);
        } catch (Exception e) {
            done(m, "failed", null, e.getMessage());
        }
    }

    private void sendEmail(Message m) {
        try {
            done(m, "sent", mail.send(m.getContact(), m.getSubject(), m.getBody(), null), null);
        } catch (Exception e) {
            done(m, "failed", null, e.getMessage());
        }
    }

    private void sendSms(List<Message> batch) {
        for (int i = 0; i < batch.size(); i += smsBatch) {
            List<Message> part = batch.subList(i, Math.min(batch.size(), i + smsBatch));
            try {
                String id = sms.sendBatch(part.stream().map(m -> new SmsService.Recipient(m.getContact(), m.getName(), m.getVoucher())).toList());
                part.forEach(m -> done(m, "sent", id, null));
            } catch (Exception e) {
                part.forEach(m -> done(m, "failed", null, e.getMessage()));
            }
        }
    }

    private void done(Message m, String status, String providerId, String error) {
        m.setStatus(status);
        m.setProviderId(providerId);
        m.setError(error == null ? null : InboxService.cap(error, 1000));
        m.setUpdatedAt(LocalDateTime.now());
        messages.save(m);
    }

    private static void pause(long ms) {
        if (ms <= 0) return;
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
