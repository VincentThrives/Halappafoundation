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
    /**
     * Values for a WhatsApp template's {{1}}, {{2}}… for one person. Each value may contain {name} and {voucher}.
     * No values configured = the classic invitation: {{1}} name, {{2}} voucher (when there is one).
     * WhatsApp rejects empty values, so a missing name becomes "Friend" and anything else empty becomes "-".
     */
    public static List<String> templateParams(List<String> values, String name, String voucher) {
        String n = name == null || name.isBlank() ? "Friend" : name.trim();
        List<String> src = values == null || values.isEmpty()
                ? (voucher == null ? List.of("{name}") : List.of("{name}", "{voucher}"))
                : values;
        return src.stream().map(v -> { String s = personalise(v, n, voucher); return s.isBlank() ? "-" : s; }).toList();
    }

    /** The template text with {{1}}, {{2}}… replaced by the given values (unfilled ones are left as they are). */
    public static String fillTemplate(String body, List<String> values) {
        if (body == null) return "";
        String out = body;
        for (int i = 0; i < values.size(); i++) out = out.replace("{{" + (i + 1) + "}}", values.get(i));
        return out;
    }

    /** Highest {{n}} used in a template text (0 when none). */
    public static int templateVariables(String body) {
        int max = 0;
        if (body == null) return 0;
        var m = java.util.regex.Pattern.compile("\\{\\{\\s*(\\d+)\\s*}}").matcher(body);
        while (m.find()) max = Math.max(max, Integer.parseInt(m.group(1)));
        return max;
    }

    private static final java.util.regex.Pattern SMS_VAR = java.util.regex.Pattern.compile("##([A-Za-z0-9_]+)##");

    /** The ##variables## in an MSG91 SMS template text, in order, without repeats (e.g. [name, date, voucher]). */
    public static List<String> smsVariables(String text) {
        if (text == null) return List.of();
        java.util.LinkedHashSet<String> out = new java.util.LinkedHashSet<>();
        var m = SMS_VAR.matcher(text);
        while (m.find()) out.add(m.group(1));
        return List.copyOf(out);
    }

    /**
     * Values of an SMS template's ##variables## for one person. Each configured value may contain {name} and {voucher};
     * ##name## and ##voucher## fill themselves when not configured. No variables in the text = name and voucher.
     */
    public static java.util.Map<String, String> smsValues(java.util.Map<String, String> configured, List<String> vars,
                                                          String name, String voucher) {
        String n = name == null || name.isBlank() ? "Friend" : name.trim();
        List<String> keys = vars == null || vars.isEmpty() ? List.of("name", "voucher") : vars;
        java.util.Map<String, String> out = new java.util.LinkedHashMap<>();
        for (String k : keys) {
            String v = configured == null ? null : configured.get(k);
            if (v == null || v.isBlank()) v = "name".equalsIgnoreCase(k) ? "{name}" : "voucher".equalsIgnoreCase(k) ? "{voucher}" : "";
            out.put(k, personalise(v, n, voucher));
        }
        return out;
    }

    /** The SMS text with its ##variables## replaced (what the person receives). */
    public static String fillSms(String text, java.util.Map<String, String> values) {
        if (text == null) return "";
        String out = text;
        for (var e : values.entrySet()) out = out.replace("##" + e.getKey() + "##", e.getValue());
        return out;
    }

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
