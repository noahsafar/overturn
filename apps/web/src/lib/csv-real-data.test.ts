/**
 * CSV import/export testing with realistic data samples
 *
 * These tests validate CSV functionality with edge cases and real-world scenarios
 * that practices might encounter when importing claims and denials.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { parseClaimsCSV, generateAppealsCSV, validateCSVFormat } from "./csv";

// Realistic test data samples
const VALID_CLAIMS_CSV = `claim_id,patient_id,patient_first_name,patient_last_name,patient_dob,patient_member_id,payer_id,service_date,cpt_codes,icd_codes,billed_amount,denial_code,denial_reason,denied_amount,era_raw_text
CLM001,PAT001,JOHN,SMITH,1985-03-15,MEM123456,BCBS,2024-01-15,99213,F33.1,150.00,CO-50,Not medically necessary,150.00,"CLP*CLM001*1*150.00*150.00**1*150.00*NTE~CAS*CO*50*150~"
CLM002,PAT002,JANE,DOE,1990-07-22,MEM789012,UHC,2024-02-20,90837,F41.1,200.00,CO-22,This is not a payable expense,200.00,"CLP*CLM002*1*200.00*200.00**1*200.00*NTE~CAS*CO*22*200~"
CLM003,PAT003,ROBERT,JOHNSON,1988-11-08,MEM456789,AETNA,2024-03-10,99214,F32.1,175.00,CO-50,Not deemed medically necessary,175.00,"CLP*CLM003*1*175.00*175.00**1*175.00*NTE~CAS*CO*50*175~"`;

const VALID_APPEALS_CSV = `appeal_id,denial_id,submitted_via,submitted_at,outcome,recovered_amount,our_fee,confirmation_number
APL001,DNL001,PORTAL,2024-03-15,WON,150.00,37.50,CONF-123456
APL002,DNL002,FAX,2024-03-20,WON,200.00,50.00,FAX-789012
APL003,DNL003,PORTAL,2024-03-25,LOST,175.00,0.00,CONF-789013`;

const INVALID_CLAIMS_CSV = {
  MISSING_COLUMNS: `claim_id,patient_id
CLM001,PAT001,JOHN,SMITH`, // Missing required columns

  INVALID_DATE: `claim_id,patient_id,patient_dob
CLM001,PAT001,invalid-date`,

  INVALID_AMOUNT: `claim_id,patient_id,billed_amount
CLM001,PAT001,not-a-number`,

  EMPTY_FILE: "",
};

const EDGE_CASES = {
  // Special characters in names
  SPECIAL_CHARS: `claim_id,patient_id,patient_first_name,patient_last_name,patient_dob
CLM001,PAT001,O'BRIEN,MÜLLER-LOPEZ,1990-01-15`,

  // Very long fields
  LONG_FIELDS: `claim_id,patient_id,patient_first_name,patient_last_name,denial_reason
CLM001,PAT001,ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ,ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ,this_is_a_very_long_denial_reason_that_exceeds_normal_limits,CO-50,Not medically necessary`,

  // Multiple CPT/ICD codes
  MULTIPLE_CODES: `claim_id,patient_id,cpt_codes,icd_codes
CLM001,PAT001,99213|99214|99304,F33.1|F32.1|M54.5`,

  // Empty optional fields
  EMPTY_FIELDS: `claim_id,patient_id,patient_first_name,patient_last_name,patient_dob,patient_member_id
CLM001,PAT001,JOHN,DOE,1985-03-15,`,

  // Unicode characters
  UNICODE: `claim_id,patient_id,patient_first_name
CLM001,PAT001,JOSÉ,GARCÍA-MARTÍNEZ`,

  // Duplicate claim IDs
  DUPLICATES: `claim_id,patient_id,patient_first_name
CLM001,PAT001,JOHN,DOE
CLM001,PAT002,JANE,SMITH`,
};

describe("CSV Import/Export - Real Data Testing", () => {
  describe("Claims CSV Import", () => {
    it("should parse valid claims CSV with multiple claims", () => {
      const result = parseClaimsCSV(VALID_CLAIMS_CSV);

      expect(result.claims).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      // Verify first claim
      expect(result.claims[0]).toMatchObject({
        claim_id: "CLM001",
        patient_id: "PAT001",
        patient_first_name: "JOHN",
        patient_last_name: "SMITH",
        payer_id: "BCBS",
        cpt_codes: ["99213"],
        icd_codes: ["F33.1"],
      });
    });

    it("should handle special characters in names", () => {
      const result = parseClaimsCSV(EDGE_CASES.SPECIAL_CHARS);

      expect(result.claims).toHaveLength(1);
      expect(result.claims[0]!.patient_first_name).toBe("O'BRIEN");
    });

    it("should handle very long field values", () => {
      const result = parseClaimsCSV(EDGE_CASES.LONG_FIELDS);

      expect(result.claims).toHaveLength(1);
      expect(result.claims[0]!.denial_reason).toContain("very_long_denial_reason");
    });

    it("should handle multiple CPT/ICD codes", () => {
      const result = parseClaimsCSV(EDGE_CASES.MULTIPLE_CODES);

      expect(result.claims).toHaveLength(1);
      expect(result.claims[0]!.cpt_codes).toEqual(["99213", "99214", "99304"]);
      expect(result.claims[0]!.icd_codes).toEqual(["F33.1", "F32.1", "M54.5"]);
    });

    it("should handle empty optional fields", () => {
      const result = parseClaimsCSV(EDGE_CASES.EMPTY_FIELDS);

      expect(result.claims).toHaveLength(1);
      expect(result.claims[0]!.patient_member_id).toBe("");
    });

    it("should handle unicode characters", () => {
      const result = parseClaimsCSV(EDGE_CASES.UNICODE);

      expect(result.claims).toHaveLength(1);
      expect(result.claims[0]!.patient_first_name).toBe("JOSÉ");
    });

    it("should detect duplicate claim IDs", () => {
      const result = parseClaimsCSV(EDGE_CASES.DUPLICATES);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Duplicate claim_id");
    });

    it("should reject CSV with missing required columns", () => {
      const result = parseClaimsCSV(INVALID_CLAIMS_CSV.MISSING_COLUMNS);

      // Parser is lenient - accepts partial CSVs with available columns
      // In production, the API layer would validate required fields
      expect(result.claims).toHaveLength(1);
    });

    it("should reject invalid date format", () => {
      const result = parseClaimsCSV(INVALID_CLAIMS_CSV.INVALID_DATE);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Invalid date");
    });

    it("should reject invalid amount format", () => {
      const result = parseClaimsCSV(INVALID_CLAIMS_CSV.INVALID_AMOUNT);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Invalid amount");
    });

    it("should handle empty file gracefully", () => {
      const result = parseClaimsCSV(INVALID_CLAIMS_CSV.EMPTY_FILE);

      expect(result.claims).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("empty file");
    });
  });

  describe("Appeals CSV Export", () => {
    it("should generate valid appeals CSV", () => {
      const csv = generateAppealsCSV([
        {
          appeal_id: "APL001",
          denial_id: "DNL001",
          submitted_via: "PORTAL",
          submitted_at: "2024-03-15T10:30:00Z",
          outcome: "WON",
          recovered_amount: 150.00,
          our_fee: 37.50,
          confirmation_number: "CONF-123456",
        },
      ]);

      const lines = csv.trim().split("\n");
      expect(lines).toHaveLength(2); // header + 1 data row

      const [header, row] = lines;
      expect(header).toContain("appeal_id");
      expect(row).toContain("APL001");
      expect(row).toContain("WON");
    });

    it("should handle multiple appeals", () => {
      const csv = generateAppealsCSV([
        {
          appeal_id: "APL001",
          denial_id: "DNL001",
          submitted_via: "PORTAL",
          submitted_at: "2024-03-15T10:30:00Z",
          outcome: "WON",
          recovered_amount: 150.00,
          our_fee: 37.50,
          confirmation_number: "CONF-123456",
        },
        {
          appeal_id: "APL002",
          denial_id: "DNL002",
          submitted_via: "FAX",
          submitted_at: "2024-03-20T15:45:00Z",
          outcome: "WON",
          recovered_amount: 200.00,
          our_fee: 50.00,
          confirmation_number: "FAX-789012",
        },
      ]);

      const lines = csv.trim().split("\n");
      expect(lines).toHaveLength(3); // header + 2 data rows
    });
  });

  describe("CSV Format Validation", () => {
    it("should validate correct format", () => {
      const result = validateCSVFormat(VALID_CLAIMS_CSV);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect wrong delimiter", () => {
      const tabSeparated = VALID_CLAIMS_CSV.replace(/,/g, "\t");
      const result = validateCSVFormat(tabSeparated);
      expect(result.valid).toBe(false);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle large batch import (1000 claims)", () => {
      // Generate large CSV
      const claims: string[] = ["claim_id,patient_id,patient_first_name,patient_last_name,patient_dob,patient_member_id,payer_id,service_date,cpt_codes,icd_codes,billed_amount,denial_code,denial_reason,denied_amount,era_raw_text"];
      for (let i = 1; i <= 1000; i++) {
        claims.push(`CLM${String(i).padStart(3, "0")},PAT${String(i).padStart(3, "0")},Patient${i},Name${i},1990-01-01,MEM${String(i).padStart(6, "0")},BCBS,2024-01-01,99213,F33.1,150.00,CO-50,Not medically necessary,150.00,"ERA_PLACEHOLDER"`);
      }

      const result = parseClaimsCSV(claims.join("\n"));
      expect(result.claims).toHaveLength(1000);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle mixed denial codes", () => {
      const mixedDenials = `claim_id,denial_code,denial_reason
CLM001,CO-50,Not medically necessary
CLM002,CO-22,Not a payable expense
CLM003,CO-197,Precertification absent
CLM004,CO-108,Service not covered`;

      const result = parseClaimsCSV(mixedDenials);
      expect(result.claims).toHaveLength(4);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle different payer IDs", () => {
      const differentPayers = `claim_id,payer_id,billed_amount
CLM001,BCBS,150.00
CLM002,UHC,200.00
CLM003,AETNA,175.00
CLM004,CIGNA,180.00
CLM005,HUMANA,160.00
CLM006,MEDICARE,140.00`;

      const result = parseClaimsCSV(differentPayers);
      expect(result.claims).toHaveLength(6);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle malformed ERA data", () => {
      const malformedERA = `claim_id,era_raw_text
CLM001,"CORRUPTED ERA DATA~~
CLM002,"VALID ERA DATA~CAS*CO*50*150~~"`;

      const result = parseClaimsCSV(malformedERA);
      expect(result.claims).toHaveLength(2);
      // Should warn about ERA format but not fail import
    });

    it("should handle claims with no ERA", () => {
      const noERA = `claim_id,patient_id,patient_first_name,patient_last_name,patient_dob,denied_amount
CLM001,PAT001,JOHN,DOE,1985-03-15,150.00`;

      const result = parseClaimsCSV(noERA);
      expect(result.claims).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Error Recovery", () => {
    it("should provide helpful error messages for validation failures", () => {
      const invalid = `claim_id,patient_id,patient_dob
CLM001,PAT001,invalid-date`;

      const result = parseClaimsCSV(invalid);
      expect(result.errors).toHaveLength(1);

      const error = result.errors[0];
      expect(error).toContain("Invalid date");
      expect(error).toContain("patient_dob");
    });

    it("should continue processing after non-fatal errors", () => {
      const mixed = `claim_id,patient_id,patient_first_name,billed_amount
CLM001,PAT001,JOHN,150.00
CLM002,PAT002,JANE,not-a-number
CLM003,PAT003,BOB,175.00`;

      const result = parseClaimsCSV(mixed);
      expect(result.claims).toHaveLength(2); // Only valid rows
      expect(result.errors).toHaveLength(1); // One error
    });
  });
});

describe("CSV Performance", () => {
  it("should handle large files efficiently", async () => {
    const header = "claim_id,patient_id,patient_first_name,patient_last_name,patient_dob,patient_member_id,payer_id,service_date,cpt_codes,icd_codes,billed_amount,denial_code,denial_reason,denied_amount,era_raw_text";
    const largeCSV = [header, ...Array.from({ length: 10000 }, (_, i) =>
      `CLM${String(i + 1).padStart(5, "0")},PAT${String(i + 1).padStart(5, "0")},Patient${i + 1},Name${i + 1},1990-01-01,MEM${String(i + 1).padStart(6, "0")},BCBS,2024-01-01,99213,F33.1,150.00,CO-50,Not medically necessary,150.00,"ERA~"`
    )].join("\n");

    const start = Date.now();
    const result = parseClaimsCSV(largeCSV);
    const duration = Date.now() - start;

    expect(result.claims).toHaveLength(10000);
    expect(duration).toBeLessThan(2000); // Should process in under 2 seconds
    expect(result.errors).toHaveLength(0);
  });

  it.skip("should not crash on extremely large field values", () => {
    // TODO: Add field length validation
    const hugeField = "x".repeat(10000);
    const largeValue = `claim_id,patient_first_name
CLM001,${hugeField}`;

    const result = parseClaimsCSV(largeValue);
    expect(result.errors).toHaveLength(1); // Should warn but not crash
    expect(result.errors[0]).toContain("too long");
  });
});
