import { z } from "zod";

export const SubmitInput = z.object({
  appeal: z.object({
    id: z.string(),
    denial_id: z.string(),
    claim_id: z.string(),
    payer_id: z.string(),
    letter: z.string(),
    primary_reason: z.string(),
    denied_amount: z.number(),
    claim_control_number: z.string(),
  }),
  payer: z.object({
    id: z.string(),
    name: z.string(),
    portal_url: z.string().nullable(),
    fax_number: z.string().nullable(),
    appeal_address: z.string().nullable(),
    epa_supported: z.boolean(),
  }),
});
export type SubmitInput = z.infer<typeof SubmitInput>;

export interface SubmitResult {
  success: boolean;
  channel: "PORTAL";
  confirmation_number?: string;
  submitted_at: string;
  screenshots: string[];
  errorMessage?: string;
}
