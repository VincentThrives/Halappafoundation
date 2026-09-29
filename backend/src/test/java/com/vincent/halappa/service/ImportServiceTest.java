package com.vincent.halappa.service;

import com.vincent.halappa.common.ApiException;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ImportServiceTest {

    private final ImportService importer = new ImportService(5000);

    /** Builds a sheet; Double values become numeric cells like Excel does for typed phone numbers. */
    private static MockMultipartFile excel(boolean xls, Object[]... rows) throws IOException {
        try (Workbook wb = xls ? new HSSFWorkbook() : new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet s = wb.createSheet();
            for (int r = 0; r < rows.length; r++) {
                Row row = s.createRow(r);
                for (int c = 0; c < rows[r].length; c++) {
                    Object v = rows[r][c];
                    if (v instanceof Double d) row.createCell(c).setCellValue(d);
                    else if (v != null) row.createCell(c).setCellValue(v.toString());
                }
            }
            wb.write(out);
            return new MockMultipartFile("file", xls ? "list.xls" : "list.xlsx", "application/octet-stream", out.toByteArray());
        }
    }

    private static MockMultipartFile csv(String text) {
        return new MockMultipartFile("file", "list.csv", "text/csv", text.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void readsColumnsInAnyOrderWithNumericPhones() throws IOException {
        var res = importer.read(excel(false,
                new Object[]{"Voucher No", "Mobile Number", "Full Name"},
                new Object[]{"KIT-1", 9845012345d, "Ramesh"},
                new Object[]{"KIT-2", 9123456789d, "Suma"}));
        assertThat(res.rows()).hasSize(2);
        assertThat(res.hasVoucherColumn()).isTrue();
        var r = res.rows().get(0);
        assertThat(r.phone()).isEqualTo("919845012345"); // not 9.845012345E9
        assertThat(r.name()).isEqualTo("Ramesh");
        assertThat(r.voucher()).isEqualTo("KIT-1");
        assertThat(r.row()).isEqualTo(2);
    }

    @Test
    void readsOldXlsFiles() throws IOException {
        var res = importer.read(excel(true, new Object[]{"Name", "Phone"}, new Object[]{"A", "9845012345"}));
        assertThat(res.rows()).extracting(ImportService.Row::phone).containsExactly("919845012345");
    }

    @Test
    void understandsKannadaHeaders() throws IOException {
        var res = importer.read(excel(false, new Object[]{"ಹೆಸರು", "ಮೊಬೈಲ್"}, new Object[]{"ಸುರೇಶ್", "9845012345"}));
        assertThat(res.rows().get(0).name()).isEqualTo("ಸುರೇಶ್");
    }

    @Test
    void headerCanBeBelowATitleRow() throws IOException {
        var res = importer.read(excel(false,
                new Object[]{"Kit distribution list – Madhugiri"},
                new Object[]{},
                new Object[]{"Name", "Phone"},
                new Object[]{"A", "9845012345"}));
        assertThat(res.rows()).hasSize(1);
    }

    @Test
    void reportsBadRowsDuplicatesAndBlankLinesAreSkipped() throws IOException {
        var res = importer.read(excel(false,
                new Object[]{"Name", "Phone", "Email", "Voucher"},
                new Object[]{"A", "9845012345", null, "V1"},
                new Object[]{"B", "12345", null, "V2"},
                new Object[]{"C", "+91 98450 12345", null, "V3"},
                new Object[]{},
                new Object[]{"D", null, null, "V4"},
                new Object[]{"E", "9000000001", null, "v1"},
                new Object[]{"F", null, "f@example.com", null}));
        assertThat(res.rows()).extracting(ImportService.Row::name).containsExactly("A", "F");
        assertThat(res.problems()).extracting(ImportService.Problem::reason).containsExactly(
                "Invalid phone: 12345",
                "Duplicate of row 2 (same phone)",
                "No phone or email",
                "Voucher v1 already used in row 2");
        assertThat(res.totalRows()).isEqualTo(6);
    }

    @Test
    void csvWithBomQuotesAndCommas() {
        var res = importer.read(csv("﻿Name,Phone,Voucher\n\"Kumar, R\",9845012345,KIT-9\n\"He said \"\"hi\"\"\",9123456789,KIT-10\n"));
        assertThat(res.rows()).extracting(ImportService.Row::name).containsExactly("Kumar, R", "He said \"hi\"");
        assertThat(res.rows().get(1).voucher()).isEqualTo("KIT-10");
    }

    @Test
    void noHeaderRowGuessesThePhoneColumn() {
        var res = importer.read(csv("Ramesh,9845012345\nSuma,9123456789\n"));
        assertThat(res.rows()).extracting(ImportService.Row::phone).containsExactly("919845012345", "919123456789");
        assertThat(res.rows().get(0).name()).isEqualTo("Ramesh");
    }

    @Test
    void emailOnlyLists() {
        var res = importer.read(csv("Name,Email\nA,a@example.com\nB,bad-email\n"));
        assertThat(res.rows()).extracting(ImportService.Row::email).containsExactly("a@example.com");
        assertThat(res.problems()).hasSize(1);
        assertThat(res.hasEmailColumn()).isTrue();
    }

    @Test
    void acceptsExactly5000AndRejects5001() {
        StringBuilder sb = new StringBuilder("Name,Phone\n");
        for (int i = 0; i < 5000; i++) sb.append("P").append(i).append(",9").append(String.format("%09d", i)).append('\n');
        assertThat(importer.read(csv(sb.toString())).rows()).hasSize(5000);
        sb.append("Extra,8999999999\n");
        assertThatThrownBy(() -> importer.read(csv(sb.toString())))
                .isInstanceOf(ApiException.class).hasMessageContaining("5001 valid rows; the limit is 5000");
    }

    @Test
    void fileWithoutPhoneOrEmailIsRejected() {
        assertThatThrownBy(() -> importer.read(csv("Name,City\nA,Tumakuru\n"))).isInstanceOf(ApiException.class)
                .hasMessageContaining("No Phone or Email column");
    }

    @Test
    void garbageFileIsRejectedClearly() {
        assertThatThrownBy(() -> importer.read(new MockMultipartFile("file", "x.xlsx", "application/octet-stream", new byte[]{1, 2, 3})))
                .isInstanceOf(ApiException.class).hasMessageContaining("Could not read the file");
        assertThatThrownBy(() -> importer.read(null)).isInstanceOf(ApiException.class);
    }

    @Test
    void downloadableTemplateImportsCleanly() {
        byte[] tpl = new ExcelService().importTemplate();
        var res = importer.read(new MockMultipartFile("file", "t.xlsx", "application/octet-stream", tpl));
        assertThat(res.rows()).hasSize(2);
        assertThat(res.rows().get(1).name()).isEqualTo("ಸುಮಾ");
        assertThat(res.rows().get(1).voucher()).isEqualTo("KIT-0002");
        assertThat(res.problems()).isEmpty();
    }
}
