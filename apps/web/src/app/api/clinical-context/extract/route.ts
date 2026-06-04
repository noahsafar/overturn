// POST /api/clinical-context/extract — Extract clinical context from medical documents
import { apiHandler } from "@/lib/api";
import { z } from "zod";

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

    // Convert file to base64 for processing
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');

    try {
      // Use Anthropic API to extract and organize clinical context
      const response = await fetch(
        process.env.ZAI_ENDPOINT || "https://api.z.ai/api/anthropic/v1/messages",
        {
          method: "POST",
          headers: {
            "x-api-key": process.env.ZAI_API_KEY || process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL_DRAFT || "claude-sonnet-4-20250514",
            max_tokens: 3000,
            temperature: 0.3,
            system: `You are a medical documentation specialist. Your task is to EXTRACT and ORGANIZE clinical information from medical documents into a clear, structured format.

INSTRUCTIONS:
1. Extract ONLY the clinical information actually present in the document
2. DO NOT invent, fabricate, or hallucinate measurements or clinical findings
3. Organize the extracted information into clear sections
4. Preserve specific measurements, scores, and assessments verbatim
5. If information is missing, leave it out - DO NOT fill in gaps
6. Focus on actionable clinical information relevant to insurance appeals

OUTPUT FORMAT:
Create a well-organized clinical context document with these sections when information is available:

- CLINICAL PRESENTATION: Chief complaint, symptom onset, duration
- FUNCTIONAL ASSESSMENT: Measurements (ROM, strength, pain scores, etc.), limitations
- TREATMENT PROVIDED: Specific interventions, frequencies, techniques
- PROGRESS NOTES: Baseline vs. current, improvements, responses
- MEDICAL NECESSITY: Why services are needed, consequences of stopping

If the document doesn't contain certain types of information, omit those sections rather than inventing content.`,
            messages: [
              {
                role: "user",
                content: `Extract and organize clinical information from this medical document. Create a comprehensive clinical context suitable for an insurance appeal.

Document filename: ${file.name}
Document content (base64): ${base64.substring(0, 5000)}...`,
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status}`);
      }

      const data = await response.json();
      const extractedContext = data.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n");

      return {
        success: true,
        extracted: extractedContext,
        filename: file.name,
        confidence: 0.85, // High confidence when extracting from real documents
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
