package com.vincent.halappa.service;

import com.vincent.halappa.domain.Enquiry;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ExcelServiceTest {

    private final ExcelService excel = new ExcelService();

    static Enquiry enquiry(long id, String name, String district, String type, String channel, String status) {
        Enquiry e = new Enquiry();
        e.setId(id);
        e.setName(name);
        e.setPhone("98450000" + id);
        e.setDistrict(district);
        e.setType(type);
        e.setChannel(channel);
        e.setStatus(status);
        e.setMessage("Message " + id);
        e.setLang("en");
        e.setCreatedAt(LocalDateTime.of(2026, 9, (int) id, 10, 30));
        return e;
    }

    private XSSFWorkbook read(byte[] bytes) throws IOException {
        return new XSSFWorkbook(new ByteArrayInputStream(bytes));
    }

    @Test
    void hasEnquiriesAndSummarySheets() throws IOException {
        try (var wb = read(excel.enquiries(List.of(enquiry(1, "A", "Tumakuru", "query", "email", "new")), "All enquiries"))) {
            assertThat(wb.getNumberOfSheets()).isEqualTo(2);
            assertThat(wb.getSheetName(0)).isEqualTo("Enquiries");
            assertThat(wb.getSheetName(1)).isEqualTo("Summary");
        }
    }

    @Test
    void headerRowAndOneRowPerEnquiry() throws IOException {
        var rows = List.of(enquiry(1, "A", "Tumakuru", "query", "email", "new"),
                enquiry(2, "B", "Mandya", "request", "whatsapp", "resolved"));
        try (var wb = read(excel.enquiries(rows, "x"))) {
            Sheet s = wb.getSheet("Enquiries");
            assertThat(s.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Ref #");
            assertThat(s.getRow(0).getCell(9).getStringCellValue()).isEqualTo("Message");
            assertThat(s.getLastRowNum()).isEqualTo(2);
            Row r1 = s.getRow(1);
            assertThat(r1.getCell(0).getNumericCellValue()).isEqualTo(1d);
            assertThat(r1.getCell(1).getStringCellValue()).isEqualTo("01-09-2026 10:30");
            assertThat(r1.getCell(2).getStringCellValue()).isEqualTo("A");
            assertThat(s.getRow(2).getCell(10).getStringCellValue()).isEqualTo("whatsapp");
            assertThat(s.getPaneInformation().isFreezePane()).isTrue();
        }
    }

    @Test
    void kannadaTextSurvivesRoundTrip() throws IOException {
        var e = enquiry(3, "ಸುರೇಶ್ ಕುಮಾರ್", "Tumakuru", "query", "email", "new");
        e.setMessage("ಉದ್ಯೋಗ ಮೇಳ ಯಾವಾಗ?");
        try (var wb = read(excel.enquiries(List.of(e), "x"))) {
            Row r = wb.getSheet("Enquiries").getRow(1);
            assertThat(r.getCell(2).getStringCellValue()).isEqualTo("ಸುರೇಶ್ ಕುಮಾರ್");
            assertThat(r.getCell(9).getStringCellValue()).isEqualTo("ಉದ್ಯೋಗ ಮೇಳ ಯಾವಾಗ?");
        }
    }

    @Test
    void nullFieldsBecomeEmptyCells() throws IOException {
        var e = enquiry(4, "C", null, null, "email", "new");
        try (var wb = read(excel.enquiries(List.of(e), "x"))) {
            Row r = wb.getSheet("Enquiries").getRow(1);
            assertThat(r.getCell(4).getStringCellValue()).isEmpty(); // email
            assertThat(r.getCell(5).getStringCellValue()).isEmpty(); // district
        }
    }

    @Test
    void summaryShowsPeriodTotalAndGroupCounts() throws IOException {
        List<Enquiry> rows = new ArrayList<>();
        rows.add(enquiry(1, "A", "Tumakuru", "query", "email", "new"));
        rows.add(enquiry(2, "B", "Tumakuru", "request", "whatsapp", "new"));
        rows.add(enquiry(3, "C", "Mandya", "request", "email", "resolved"));
        rows.add(enquiry(4, "D", null, "query", "email", "new"));
        try (var wb = read(excel.enquiries(rows, "01-09-2026 to 30-09-2026"))) {
            Sheet s = wb.getSheet("Summary");
            assertThat(find(s, "Period")).isEqualTo("01-09-2026 to 30-09-2026");
            assertThat(find(s, "Total enquiries")).isEqualTo("4");
            assertThat(find(s, "Tumakuru")).isEqualTo("2");
            assertThat(find(s, "Mandya")).isEqualTo("1");
            assertThat(find(s, "(not given)")).isEqualTo("1");
            assertThat(find(s, "new")).isEqualTo("3");
            assertThat(find(s, "resolved")).isEqualTo("1");
            assertThat(find(s, "whatsapp")).isEqualTo("1");
            assertThat(find(s, "request")).isEqualTo("2");
        }
    }

    @Test
    void emptyListStillProducesValidFile() throws IOException {
        try (var wb = read(excel.enquiries(List.of(), "22-09-2026 to 28-09-2026"))) {
            assertThat(wb.getSheet("Enquiries").getLastRowNum()).isZero();
            assertThat(find(wb.getSheet("Summary"), "Total enquiries")).isEqualTo("0");
        }
    }

    /** Value in column B for the first row whose column A equals label. */
    private static String find(Sheet s, String label) {
        for (Row r : s) {
            if (r.getCell(0) != null && label.equals(r.getCell(0).getStringCellValue())) {
                var c = r.getCell(1);
                return switch (c.getCellType()) {
                    case NUMERIC -> String.valueOf((long) c.getNumericCellValue());
                    default -> c.getStringCellValue();
                };
            }
        }
        return null;
    }
}
