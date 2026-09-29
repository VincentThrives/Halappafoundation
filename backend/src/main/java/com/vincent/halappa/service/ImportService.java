package com.vincent.halappa.service;

import com.vincent.halappa.common.ApiException;
import org.apache.poi.ss.usermodel.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Reads recipient lists from Excel (.xlsx/.xls) or CSV: Name, Phone, Email, Voucher columns in any order. */
@Service
public class ImportService {

    public record Row(int row, String name, String phone, String email, String voucher) {}
    public record Problem(int row, String reason) {}
    public record Result(List<Row> rows, List<Problem> problems, int totalRows, boolean hasVoucherColumn,
                         boolean hasPhoneColumn, boolean hasEmailColumn) {}

    private static final Map<String, List<String>> HEADERS = Map.of(
            "name", List.of("name", "fullname", "beneficiary", "beneficiaryname", "ಹೆಸರು"),
            "phone", List.of("phone", "mobile", "mobileno", "mobilenumber", "phonenumber", "phoneno", "whatsapp",
                    "whatsappnumber", "number", "contact", "contactnumber", "cell", "ಮೊಬೈಲ್", "ದೂರವಾಣಿ", "ಫೋನ್"),
            "email", List.of("email", "emailid", "emailaddress", "mail", "ಇಮೇಲ್"),
            "voucher", List.of("voucher", "voucherno", "vouchernumber", "vouchercode", "token", "tokenno", "pass",
                    "passno", "entry", "entryno", "coupon", "ticket", "ಚೀಟಿ", "ಟೋಕನ್"));

    private final int maxRecipients;

    public ImportService(@Value("${app.campaign.max-recipients:5000}") int maxRecipients) {
        this.maxRecipients = maxRecipients;
    }

    public Result read(MultipartFile file) {
        if (file == null || file.isEmpty()) throw ApiException.badRequest("Choose an Excel or CSV file");
        String name = Optional.ofNullable(file.getOriginalFilename()).orElse("").toLowerCase();
        List<List<String>> grid;
        try (InputStream in = file.getInputStream()) {
            grid = name.endsWith(".csv") || name.endsWith(".txt") ? readCsv(in) : readExcel(in);
        } catch (IOException | RuntimeException e) {
            if (e instanceof ApiException ae) throw ae;
            throw ApiException.badRequest("Could not read the file. Save it as .xlsx or .csv and try again.");
        }
        return parse(grid);
    }

    Result parse(List<List<String>> grid) {
        // Find the header row among the first 10 rows.
        int headerRow = -1;
        Map<String, Integer> col = new HashMap<>();
        for (int r = 0; r < Math.min(10, grid.size()) && headerRow < 0; r++) {
            Map<String, Integer> found = new HashMap<>();
            List<String> cells = grid.get(r);
            for (int c = 0; c < cells.size(); c++) {
                String key = cells.get(c) == null ? "" : cells.get(c).toLowerCase().replaceAll("[^\\p{L}\\p{M}\\p{N}]", "");
                for (var e : HEADERS.entrySet()) if (e.getValue().contains(key) && !found.containsKey(e.getKey())) found.put(e.getKey(), c);
            }
            if (found.containsKey("phone") || found.containsKey("email")) { headerRow = r; col = found; }
        }
        if (headerRow < 0) {
            // No header: pick the first column where most values look like phone numbers.
            int phoneCol = guessPhoneColumn(grid);
            if (phoneCol < 0) throw ApiException.badRequest("No Phone or Email column found. Add a header row: Name, Phone, Email, Voucher.");
            col.put("phone", phoneCol);
            for (int c = 0; c < width(grid); c++) if (c != phoneCol) { col.put("name", c); break; }
        }

        List<Row> rows = new ArrayList<>();
        List<Problem> problems = new ArrayList<>();
        Map<String, Integer> seenPhone = new HashMap<>(), seenEmail = new HashMap<>(), seenVoucher = new HashMap<>();
        int total = 0;
        for (int r = headerRow + 1; r < grid.size(); r++) {
            List<String> cells = grid.get(r);
            if (cells.stream().allMatch(s -> s == null || s.isBlank())) continue;
            total++;
            int rowNo = r + 1;
            String name = cell(cells, col.get("name"));
            String rawPhone = cell(cells, col.get("phone"));
            String rawEmail = cell(cells, col.get("email"));
            String voucher = cell(cells, col.get("voucher"));
            String phone = rawPhone == null ? null : Contacts.phone(rawPhone);
            String email = rawEmail == null ? null : Contacts.email(rawEmail);

            if (rawPhone != null && phone == null) { problems.add(new Problem(rowNo, "Invalid phone: " + rawPhone)); if (email == null) continue; }
            if (rawEmail != null && email == null) { problems.add(new Problem(rowNo, "Invalid email: " + rawEmail)); if (phone == null) continue; }
            if (phone == null && email == null) { problems.add(new Problem(rowNo, "No phone or email")); continue; }
            if (phone != null && seenPhone.containsKey(phone)) { problems.add(new Problem(rowNo, "Duplicate of row " + seenPhone.get(phone) + " (same phone)")); continue; }
            if (phone == null && seenEmail.containsKey(email)) { problems.add(new Problem(rowNo, "Duplicate of row " + seenEmail.get(email) + " (same email)")); continue; }
            if (voucher != null && seenVoucher.containsKey(voucher.toUpperCase())) {
                problems.add(new Problem(rowNo, "Voucher " + voucher + " already used in row " + seenVoucher.get(voucher.toUpperCase()))); continue;
            }
            if (phone != null) seenPhone.put(phone, rowNo);
            if (email != null) seenEmail.putIfAbsent(email, rowNo);
            if (voucher != null) seenVoucher.put(voucher.toUpperCase(), rowNo);
            rows.add(new Row(rowNo, InboxService.cap(name, 150), phone, email, InboxService.cap(voucher, 60)));
        }
        if (rows.size() > maxRecipients)
            throw ApiException.badRequest("The file has " + rows.size() + " valid rows; the limit is " + maxRecipients + " per send. Split it into smaller files.");
        return new Result(rows, problems, total, col.containsKey("voucher"), col.containsKey("phone"), col.containsKey("email"));
    }

    // ---------- file readers ----------

    private List<List<String>> readExcel(InputStream in) throws IOException {
        try (Workbook wb = WorkbookFactory.create(in)) {
            Sheet sh = wb.getSheetAt(0);
            DataFormatter fmt = new DataFormatter();
            List<List<String>> grid = new ArrayList<>();
            for (int r = 0; r <= sh.getLastRowNum(); r++) {
                org.apache.poi.ss.usermodel.Row row = sh.getRow(r);
                List<String> cells = new ArrayList<>();
                if (row != null) {
                    for (int c = 0; c < Math.max(row.getLastCellNum(), 0); c++) {
                        Cell cell = row.getCell(c);
                        if (cell == null) { cells.add(null); continue; }
                        // Phone numbers typed as numbers must not come out as 9.845012345E9.
                        CellType t = cell.getCellType() == CellType.FORMULA ? cell.getCachedFormulaResultType() : cell.getCellType();
                        String v = t == CellType.NUMERIC && !DateUtil.isCellDateFormatted(cell)
                                ? BigDecimal.valueOf(cell.getNumericCellValue()).stripTrailingZeros().toPlainString()
                                : fmt.formatCellValue(cell);
                        cells.add(v == null || v.isBlank() ? null : v.trim());
                    }
                }
                grid.add(cells);
            }
            return grid;
        }
    }

    private List<List<String>> readCsv(InputStream in) throws IOException {
        List<List<String>> grid = new ArrayList<>();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            boolean first = true;
            while ((line = br.readLine()) != null) {
                if (first && line.startsWith("﻿")) line = line.substring(1);
                first = false;
                grid.add(splitCsv(line));
            }
        }
        return grid;
    }

    static List<String> splitCsv(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (quoted) {
                if (ch == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') { cur.append('"'); i++; }
                else if (ch == '"') quoted = false;
                else cur.append(ch);
            } else if (ch == '"') quoted = true;
            else if (ch == ',') { out.add(clean(cur)); cur.setLength(0); }
            else cur.append(ch);
        }
        out.add(clean(cur));
        return out;
    }

    private static String clean(StringBuilder sb) { String s = sb.toString().trim(); return s.isEmpty() ? null : s; }

    private static String cell(List<String> cells, Integer idx) {
        if (idx == null || idx >= cells.size()) return null;
        String v = cells.get(idx);
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static int width(List<List<String>> grid) { return grid.stream().mapToInt(List::size).max().orElse(0); }

    private static int guessPhoneColumn(List<List<String>> grid) {
        for (int c = 0; c < width(grid); c++) {
            int phones = 0, filled = 0;
            for (List<String> row : grid.subList(0, Math.min(grid.size(), 30))) {
                String v = c < row.size() ? row.get(c) : null;
                if (v == null) continue;
                filled++;
                if (Contacts.phone(v) != null) phones++;
            }
            if (filled > 0 && phones * 2 >= filled) return c;
        }
        return -1;
    }
}
