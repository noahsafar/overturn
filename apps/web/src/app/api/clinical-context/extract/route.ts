// POST /api/clinical-context/extract — Extract clinical context from medical documents
import { apiHandler } from "@/lib/api";
import { z } from "zod";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

async function extractPDFText(file: File): Promise<string> {
  // Save file to temp directory
  const tempPath = join(tmpdir(), `temp_${Date.now()}.pdf`);
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(tempPath, buffer);

  try {
    // Use Python to extract text (more reliable than Node.js PDF libraries)
    const pythonScript = `
import sys
try:
    import pypdf
except ImportError:
    import PyPDF2 as pypdf

pdf_path = sys.argv[1]
with open(pdf_path, 'rb') as f:
    reader = pypdf.PdfReader(f)
    text = ''
    for page in reader.pages:
        text += page.extract_text()
print(text)
`;

    const result = execSync(`python3 -c "${pythonScript}" ${tempPath}`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return result;
  } catch (error) {
    console.error("PDF extraction error:", error);
    throw new Error("Failed to extract text from PDF");
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function validateExtraction(sourceText: string, extractedText: string): number {
  // Check for potential hallucinations by comparing key information
  const sourceLower = sourceText.toLowerCase();
  const extractedLower = extractedText.toLowerCase();

  // Extract potential measurements, dates, names from both texts
  const measurements = extractedText.match(/\d+°|\d+\/\d+|\d+\s*%/g) || [];
  const dates = extractedText.match(/\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]+ \d{1,2}, \d{4}/g) || [];

  // Check if extracted measurements appear in source
  let hallucinationScore = 0;
  measurements.forEach((m: string) => {
    if (!sourceLower.includes(m.toLowerCase())) {
      hallucinationScore++;
      console.warn(`Potential hallucination: Measurement "${m}" not found in source`);
    }
  });

  // Check if extracted dates appear in source
  dates.forEach((d: string) => {
    if (!sourceLower.includes(d.toLowerCase())) {
      hallucinationScore++;
      console.warn(`Potential hallucination: Date "${d}" not found in source`);
    }
  });

  // Calculate confidence score
  const totalChecks = measurements.length + dates.length;
  if (totalChecks === 0) return 1.0; // No measurable content to validate

  const accuracy = 1 - (hallucinationScore / totalChecks);
  return Math.max(0, Math.min(1, accuracy)); // Clamp between 0 and 1
}

const schema = z.object({
  document: z.any(), // File
});

export const POST = apiHandler(
  {
    requiredRole: "STAFF",
    audit: { action: "clinical_context.extract", resourceType: "document" },
  },
  async ({ user, req }) => {
    const formData = await req.formData();
    const file = formData.get("document") as File | null;

    if (!file) {
      return new Response("No document uploaded", { status: 400 });
    }

    // Check file type (only PDF for now)
    if (!file.name.endsWith('.pdf') && file.type !== 'application/pdf') {
      return new Response("Only PDF documents are supported", { status: 400 });
    }

    try {
      // Extract text from PDF using Python
      const extractedText = await extractPDFText(file);

      if (!extractedText || extractedText.trim().length < 50) {
        return {
          success: false,
          error: "Unable to extract text from PDF. The document may be scanned or image-based.",
          extracted: null,
        };
      }

      // Use Anthropic API to organize the extracted text (NOT to parse the PDF)
      const response = await fetch(
        process.env.ZAI_ENDPOINT || "https://api.z.ai/api/anthropic/v1/messages",
        {
          method: "POST",
          headers: {
            "x-api-key": process.env.ZAI_API_KEY || process.env.ANTHROPIC_API_KEY || "",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL_DRAFT || "claude-sonnet-4-20250514",
            max_tokens: 3000,
            temperature: 0,
            system: `You are organizing clinical documentation for insurance appeals. You MUST ONLY work with the exact text provided below.

ABSOLUTE RULES - NO EXCEPTIONS:
1. Use ONLY the text provided below - no external knowledge, assumptions, or typical clinical scenarios
2. Copy measurements, dates, scores EXACTLY as written in the source text
3. If information is not present in the source text, DO NOT include it - leave sections blank
4. DO NOT rephrase, summarize, or interpret - preserve original wording where possible
5. DO NOT add any clinical findings, measurements, or details not explicitly stated
6. Organize existing information into sections - do not create new information

EXTRACTION METHOD:
- Read through ALL provided text first
- Identify ONLY what is actually stated
- Copy exact wording for measurements, dates, names, scores
- Group related information under appropriate section headers
- If a section has NO information in the source text, omit that entire section

SECTIONS (only create if source text contains relevant information):
- PATIENT INFORMATION: Name, DOB, ID (if present)
- CLINICAL PRESENTATION: What patient/companion actually said about symptoms
- FUNCTIONAL ASSESSMENT: Only measurements and scores explicitly written
- TREATMENT PROVIDED: Only interventions specifically listed
- PROGRESS OVER TIME: Only progress notes explicitly documented
- OUTCOMES: Only outcomes actually achieved and stated
- MEDICAL NECESSITY: Only necessity statements actually written

ERROR PREVENTION:
- If unsure whether information is present, leave it out
- If text is ambiguous, state it as written or omit
- Never fill in gaps with typical values or assumptions
- Never reorganize information in a way that changes meaning

This is for insurance appeals - accuracy is more important than completeness. Better to have less information than incorrect information.`,
            messages: [
              {
                role: "user",
                content: `Organize the following clinical documentation into a structured format suitable for an insurance appeal:

${extractedText}

Extract and organize only the information present above. Do not add any information not explicitly stated in the text.`,
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status}`);
      }

      const aiData = await response.json();
      const extractedContext = aiData.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n");

      // Validate extraction for potential hallucinations
      const confidence = validateExtraction(extractedText, extractedContext);

      return {
        success: true,
        extracted: extractedContext,
        filename: file.name,
        confidence,
      };
    } catch (error) {
      console.error("[clinical-context/extract] Error:", error);

      return {
        success: false,
        error: (error as Error).message,
        extracted: null,
      };
    }
  }
);
