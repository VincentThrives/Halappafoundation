package com.vincent.halappa.service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Phone/email clean-up and message personalisation shared by campaigns, inbox and import. */
public final class Contacts {
    private Contacts() {}

    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    /** 10-digit Indian mobiles get a 91 prefix; returns digits only, or null if invalid. */
    public static String phone(String raw) {
        if (raw == null) return null;
        String d = raw.replaceAll("\\D", "");
        if (d.length() == 11 && d.startsWith("0")) d = d.substring(1);
        if (d.length() == 10) d = "91" + d;
        return d.length() >= 11 && d.length() <= 15 ? d : null;
    }

    /** Lower-cased email, or null if it doesn't look like one. */
    public static String email(String raw) {
        if (raw == null) return null;
        String e = raw.trim().toLowerCase();
        return EMAIL.matcher(e).matches() && e.length() <= 150 ? e : null;
    }

    /** Fills {name} and {voucher}; a blank name leaves no stray spaces or commas. */
    public static String personalise(String msg, String name, String voucher) {
        if (msg == null) return "";
        String n = name == null || name.isBlank() ? "" : name.trim();
        String v = voucher == null ? "" : voucher;
        return msg.replace("{name}", n).replace("{voucher}", v)
                .replaceAll("[ \\t]{2,}", " ").replace(" ,", ",").trim();
    }

    /**
     * Pasted numbers: one per line or comma/semicolon separated. Each piece may contain spaces
     * ("+91 99887 76655"); if a piece isn't one number, its space-separated parts are tried instead.
     */
    public static List<String> parseNumbers(String raw) {
        List<String> out = new ArrayList<>();
        if (raw == null) return out;
        for (String chunk : raw.split("[,;\\r\\n]+")) {
            String whole = phone(chunk);
            if (whole != null) { out.add(whole); continue; }
            for (String part : chunk.trim().split("\\s+")) {
                String p = phone(part);
                if (p != null) out.add(p);
            }
        }
        return out;
    }
}
