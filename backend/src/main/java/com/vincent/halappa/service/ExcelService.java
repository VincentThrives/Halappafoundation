package com.vincent.halappa.service;

import com.vincent.halappa.domain.Enquiry;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class ExcelService {

    private static final String[] HEADERS = {"Ref #", "Date", "Name", "Phone", "Email", "District", "Taluk",
            "Type", "Subject", "Message", "Sent via", "Status", "Notes", "Language"};
    private static final int[] WIDTHS = {8, 18, 24, 16, 28, 16, 18, 12, 28, 60, 11, 12, 30, 9};
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm");

    /** @param rangeLabel shown on the Summary sheet, e.g. "01-09-2026 to 30-09-2026" or "All enquiries" */
    public byte[] enquiries(List<Enquiry> rows, String rangeLabel) {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet("Enquiries");

            // Header in the logo's maroon with gold text.
            XSSFCellStyle head = wb.createCellStyle();
            head.setFillForegroundColor(new XSSFColor(new byte[]{(byte) 0x7A, 0x0B, 0x16}, null));
            head.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            Font hf = wb.createFont();
            hf.setBold(true);
            hf.setColor(IndexedColors.WHITE.getIndex());
            head.setFont(hf);
            head.setVerticalAlignment(VerticalAlignment.CENTER);

            CellStyle wrap = wb.createCellStyle();
            wrap.setWrapText(true);
            wrap.setVerticalAlignment(VerticalAlignment.TOP);

            Row hr = sh.createRow(0);
            hr.setHeightInPoints(22);
            for (int i = 0; i < HEADERS.length; i++) {
                Cell c = hr.createCell(i);
                c.setCellValue(HEADERS[i]);
                c.setCellStyle(head);
                sh.setColumnWidth(i, WIDTHS[i] * 256);
            }

            int r = 1;
            for (Enquiry e : rows) {
                Row row = sh.createRow(r++);
                Object[] v = {e.getId(), e.getCreatedAt() == null ? "" : e.getCreatedAt().format(DT), e.getName(),
                        e.getPhone(), e.getEmail(), e.getDistrict(), e.getTaluk(), e.getType(), e.getSubject(),
                        e.getMessage(), e.getChannel(), e.getStatus(), e.getNotes(), e.getLang()};
                for (int i = 0; i < v.length; i++) {
                    Cell c = row.createCell(i);
                    if (v[i] instanceof Long n) c.setCellValue(n);
                    else c.setCellValue(v[i] == null ? "" : v[i].toString());
                    c.setCellStyle(wrap);
                }
            }

            sh.createFreezePane(0, 1);
            sh.setAutoFilter(new CellRangeAddress(0, Math.max(r - 1, 0), 0, HEADERS.length - 1));

            writeSummary(wb, head, rows, rangeLabel);
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Could not build Excel file", e);
        }
    }

    /** Recipient list of one bulk send, with vouchers and delivery / attendance status (for the event desk). */
    public byte[] campaign(com.vincent.halappa.domain.Campaign c, List<com.vincent.halappa.domain.Message> rows) {
        String[] heads = {"#", "Name", c.getChannel().equals("email") ? "Email" : "Phone", "Voucher", "Status", "Error", "Sent / updated", "Attended at"};
        int[] widths = {6, 26, 22, 18, 12, 40, 18, 18};
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet("Recipients");
            CellStyle head = headStyle(wb);
            Row hr = sh.createRow(0);
            for (int i = 0; i < heads.length; i++) {
                Cell cell = hr.createCell(i);
                cell.setCellValue(heads[i]);
                cell.setCellStyle(head);
                sh.setColumnWidth(i, widths[i] * 256);
            }
            int r = 1;
            for (var m : rows) {
                Row row = sh.createRow(r);
                row.createCell(0).setCellValue(r++);
                row.createCell(1).setCellValue(nz(m.getName()));
                row.createCell(2).setCellValue(m.getContact());
                row.createCell(3).setCellValue(nz(m.getVoucher()));
                row.createCell(4).setCellValue(m.getStatus());
                row.createCell(5).setCellValue(nz(m.getError()));
                row.createCell(6).setCellValue(m.getUpdatedAt() == null ? "" : m.getUpdatedAt().format(DT));
                row.createCell(7).setCellValue(m.getAttendedAt() == null ? "" : m.getAttendedAt().format(DT));
            }
            sh.createFreezePane(0, 1);
            sh.setAutoFilter(new CellRangeAddress(0, Math.max(r - 1, 0), 0, heads.length - 1));
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Could not build Excel file", e);
        }
    }

    /** Blank import sheet with the expected columns and two example rows. */
    public byte[] importTemplate() {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet("Recipients");
            CellStyle head = headStyle(wb);
            CellStyle text = wb.createCellStyle();
            text.setDataFormat(wb.createDataFormat().getFormat("@")); // keep phone numbers as text
            String[] heads = {"Name", "Phone", "Email", "Voucher"};
            Row hr = sh.createRow(0);
            for (int i = 0; i < heads.length; i++) {
                Cell cell = hr.createCell(i);
                cell.setCellValue(heads[i]);
                cell.setCellStyle(head);
                sh.setColumnWidth(i, (i == 2 ? 30 : 20) * 256);
                sh.setDefaultColumnStyle(i, text);
            }
            String[][] sample = {{"Ramesh Kumar", "9845012345", "ramesh@example.com", "KIT-0001"},
                                 {"ಸುಮಾ", "9123456789", "", "KIT-0002"}};
            for (int r = 0; r < sample.length; r++) {
                Row row = sh.createRow(r + 1);
                for (int i = 0; i < 4; i++) {
                    Cell cell = row.createCell(i);
                    cell.setCellValue(sample[r][i]);
                    cell.setCellStyle(text);
                }
            }
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Could not build Excel file", e);
        }
    }

    private static CellStyle headStyle(XSSFWorkbook wb) {
        XSSFCellStyle head = wb.createCellStyle();
        head.setFillForegroundColor(new XSSFColor(new byte[]{(byte) 0x7A, 0x0B, 0x16}, null));
        head.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        Font hf = wb.createFont();
        hf.setBold(true);
        hf.setColor(IndexedColors.WHITE.getIndex());
        head.setFont(hf);
        return head;
    }

    private static String nz(String s) { return s == null ? "" : s; }

    /** Second sheet: totals by status, channel, type and district. */
    private void writeSummary(XSSFWorkbook wb, CellStyle head, List<Enquiry> rows, String rangeLabel) {
        Sheet s = wb.createSheet("Summary");
        s.setColumnWidth(0, 30 * 256);
        s.setColumnWidth(1, 12 * 256);

        CellStyle title = wb.createCellStyle();
        Font tf = wb.createFont();
        tf.setBold(true);
        tf.setFontHeightInPoints((short) 14);
        tf.setColor(IndexedColors.DARK_RED.getIndex());
        title.setFont(tf);
        CellStyle bold = wb.createCellStyle();
        Font bf = wb.createFont();
        bf.setBold(true);
        bold.setFont(bf);

        int r = 0;
        Row t = s.createRow(r++);
        t.createCell(0).setCellValue("Halappa Foundation: Enquiries");
        t.getCell(0).setCellStyle(title);
        Row range = s.createRow(r++);
        range.createCell(0).setCellValue("Period");
        range.createCell(1).setCellValue(rangeLabel);
        Row gen = s.createRow(r++);
        gen.createCell(0).setCellValue("Generated");
        gen.createCell(1).setCellValue(java.time.LocalDateTime.now().format(DT));
        Row tot = s.createRow(r++);
        tot.createCell(0).setCellValue("Total enquiries");
        tot.getCell(0).setCellStyle(bold);
        tot.createCell(1).setCellValue(rows.size());
        tot.getCell(1).setCellStyle(bold);

        r = group(s, head, r + 1, "By status", rows, Enquiry::getStatus);
        r = group(s, head, r + 1, "By channel", rows, Enquiry::getChannel);
        r = group(s, head, r + 1, "By type", rows, Enquiry::getType);
        group(s, head, r + 1, "By district", rows, Enquiry::getDistrict);
    }

    private int group(Sheet s, CellStyle head, int r, String label, List<Enquiry> rows,
                      java.util.function.Function<Enquiry, String> key) {
        Row h = s.createRow(r++);
        h.createCell(0).setCellValue(label);
        h.createCell(1).setCellValue("Count");
        h.getCell(0).setCellStyle(head);
        h.getCell(1).setCellStyle(head);
        var counts = rows.stream().collect(java.util.stream.Collectors.groupingBy(
                e -> key.apply(e) == null || key.apply(e).isBlank() ? "(not given)" : key.apply(e),
                java.util.TreeMap::new, java.util.stream.Collectors.counting()));
        for (var en : counts.entrySet().stream().sorted(java.util.Map.Entry.<String, Long>comparingByValue().reversed()).toList()) {
            Row row = s.createRow(r++);
            row.createCell(0).setCellValue(en.getKey());
            row.createCell(1).setCellValue(en.getValue());
        }
        return r;
    }
}
