// Clinical context generation utilities for appeal drafting

export interface ClaimClinicalData {
  cptCodes: string[];
  icdCodes: string[];
  serviceDate: Date | string;
  patient?: {
    firstName?: string;
    lastName?: string;
    dob?: Date | string;
  };
  denialCode?: string;
  denialReason?: string;
}

export interface StructuredClinicalContext {
  primaryComplaint: string;
  functionalLimitations: string[];
  treatmentPlan: string[];
  progressMade: string[];
  goalsMet: boolean[];
  additionalNotes: string;
}

/**
 * Generate smart clinical context from claim data
 */
export function generateClinicalContextFromClaim(claim: ClaimClinicalData): string {
  const serviceDate = formatDate(claim.serviceDate);
  const cptCodes = claim.cptCodes || [];
  const icdCodes = claim.icdCodes || [];

  const sections: string[] = [];

  if (cptCodes.length > 0) {
    const cptDescriptions = getCPTDescriptions(cptCodes);
    sections.push(`PROCEDURES PERFORMED (${serviceDate}):`);
    cptCodes.forEach((code) => {
      sections.push(`- ${code} (${getCPTDescription(code)})`);
    });
    sections.push("");
  }

  if (icdCodes.length > 0) {
    sections.push("DIAGNOSES:");
    icdCodes.forEach((code) => {
      sections.push(`- ${code} (${getICDDescription(code)})`);
    });
    sections.push("");
  }

  if (sections.length === 0) {
    sections.push(`Service Date: ${serviceDate}`);
    sections.push("See clinical documentation for complete treatment details.");
    sections.push("");
  }

  sections.push("FUNCTIONAL STATUS:");
  sections.push("Patient presents with documented functional limitations that impact daily activities and work-related functions. Clinical findings indicate measurable restrictions in range of motion, strength, and functional capacity.");
  sections.push("");

  sections.push("TREATMENT PLAN:");
  sections.push("- Progressive therapeutic exercise program targeting identified impairments");
  sections.push("- Manual therapy techniques to improve mobility and reduce pain");
  sections.push("- Functional restoration to return to prior level of function");
  sections.push("- Patient education on home exercise program and self-management");
  sections.push("");

  sections.push("PROGRESS TOWARD GOALS:");
  sections.push("Patient demonstrates measurable improvement in functional metrics with continued participation in planned therapy regimen. Documentation supports continued medical necessity for prescribed treatment course.");

  return sections.join("\n");
}

/**
 * Get denial-specific template with contextual claim information
 */
export function getDenialTemplate(denialCode: string, contextualInfo = ""): string {
  const templates: Record<string, string> = {
    'CO-50': `~CONTEXTUAL_INFO~

MEDICAL NECESSITY APPEAL - DENIAL CODE CO-50

SUPPORTING CLINICAL DOCUMENTATION:

1. FUNCTIONAL LIMITATIONS:
Patient presents with significant functional impairments that necessitate skilled therapy services. Objective measurements demonstrate substantial limitations in:
- Range of motion restrictions affecting daily activities
- Strength deficits impacting functional mobility
- Pain levels interfering with normal movement patterns
- Inability to perform work-related or ADL functions without assistance

2. TREATMENT PLAN APPROPRIATENESS:
Prescribed treatment plan is evidence-based and aligned with current clinical practice guidelines:
- Therapeutic exercises specifically target documented impairments
- Manual therapy addresses soft tissue restrictions and joint mobility
- Progressive loading supports tissue healing and functional restoration
- Treatment frequency and duration are consistent with established recovery timelines

3. PROGRESS DOCUMENTATION:
Chart notes demonstrate measurable improvement:
- Initial evaluation: [baseline functional status]
- Current status: [progress metrics and improvements]
- Ongoing functional gains support continued medical necessity
- Patient compliance with home program supports in-clinic progress

4. APPEAL REQUEST:
Based on documented clinical findings and measurable functional progress, the requested services are medically necessary for restoring patient to optimal functional level and should be approved.`,

    'CO-96': `PRIOR AUTHORIZATION APPEAL - DENIAL CODE CO-96

APPEAL BASIS:

1. AUTHORIZATION OBTAINED:
Services were prior authorized by [Payer Name] on [Date].
Authorization number: [Number]
Authorized frequency and duration: [Details]

2. SUBMITTED DOCUMENTATION:
All required medical necessity documentation was submitted with authorization request:
- Initial evaluation findings
- Treatment plan with measurable goals
- Functional limitation assessments
- Expected timeline for functional improvement

3. COMPLIANCE WITH AUTHORIZATION:
Services provided match authorized scope:
- Modality and frequency as approved
- Treatment duration within authorized timeframe
- Clinical documentation supports medical necessity
- Progress consistent with anticipated outcomes

4. REQUESTED ACTION:
Process payment for authorized services. All authorization requirements have been met and documented.`,

    'CO-97': `MEDICAL NECESSITY - DENIAL CODE CO-97

BENEFIT APPEAL:

1. CONTRACTUAL OBLIGATION:
Services are covered under patient's health plan as medically necessary treatments for [condition]. Plan documents provide coverage for skilled therapy services when:

- Required for restoration of functional impairment
- Documented medical necessity exists
- Expected to result in meaningful functional improvement
- Consistent with established clinical guidelines

2. CLINICAL NECESSITY:
Patient presents with condition requiring skilled intervention:
- [Specific diagnosis and clinical findings]
- Functional limitations prevent normal activities
- Skilled therapy services necessary for functional restoration
- Expected outcomes cannot be achieved through unskilled intervention

3. APPROPRIATENESS:
Treatment plan is appropriate for patient condition:
- Evidence-based interventions for documented impairments
- Treatment frequency consistent with clinical progression
- Expected functional improvement justifies continued care
- Plan aligns with payer coverage criteria

4. REQUEST:
Reconsider denial and process payment for medically necessary services.`,

    'CO-197': `COORDINATION OF BENEFITS - DENIAL CODE CO-197

APPEAL FOR CORRECT PROCESSING:

1. PRIMARY INSURANCE STATUS:
Patient's primary insurance is [Insurance Name] as verified through:
- Patient statement and insurance cards
- Electronic verification through [system]
- Coordination of benefits documentation on file

2. CLAIM SUBMISSION DETAILS:
Claim was submitted with correct primary payer information:
- Primary insurance: [Name] - ID: [Number]
- Secondary insurance: [Name] - ID: [Number]
- Coordination of benefits correctly applied

3. PROCESSING ERROR:
Denial appears to be a processing error:
- All required insurance information provided
- Correct primary payer identified in system
- Coordination benefits properly documented
- Claim should be processed under correct insurance

4. CORRECTIVE ACTION:
Please reprocess claim with correct primary insurance information and apply benefits accordingly.`,

    'PR-204': `PROCESSING ERROR APPEAL - DENIAL CODE PR-204

APPEAL FOR CORRECT CLAIM PROCESSING:

1. SERVICE VERIFICATION:
Services were rendered as billed:
~CONTEXTUAL_INFO~
- All services were medically necessary and appropriately documented
- Treatment provided was consistent with patient's clinical needs

2. BILLING CORRECTNESS:
Claim was submitted correctly:
- CPT codes accurately reflect services provided
- ICD codes support medical necessity for billed procedures
- Modifiers and billing units are correct per documentation

3. DOCUMENTATION:
All required documentation is available:
- Progress notes support services billed
- Functional limitations documented justify treatment
- Medical necessity criteria are met for all procedures

4. REQUESTED ACTION:
Please reprocess this claim. All services were rendered as billed and are supported by appropriate clinical documentation.`,

    'PR-1': `MEDICAL RECORDS REQUEST - DENIAL CODE PR-1

CLINICAL DOCUMENTATION SUBMISSION:

~CONTEXTUAL_INFO~

1. DOCUMENTATION AVAILABILITY:
The following clinical documentation is available for review:
- Initial evaluation with patient history and functional assessment
- Daily treatment notes with objective measurements
- Progress reports documenting functional improvements
- Discharge summary or current treatment plan

2. MEDICAL NECESSITY:
Documentation supports medical necessity of services:
- Functional limitations prevent normal activities
- Skilled therapy required for functional restoration
- Measurable progress documented throughout treatment
- Treatment plan aligned with established clinical guidelines

3. REQUESTED ACTION:
Please review the attached clinical documentation and reconsider the denial. All services were medically necessary and appropriately documented.`
  };

  const template = templates[denialCode];

  if (template) {
    // Replace the contextual info placeholder
    return template.replace('~CONTEXTUAL_INFO~', contextualInfo || '- Service date and procedures verified');
  }

  // Fallback for unknown denial codes
  return `${contextualInfo}

APPEAL FOR DENIAL CODE ${denialCode}

CLINICAL CONTEXT:
[Describe the patient's condition, functional limitations, and why treatment is medically necessary]

SUPPORTING DOCUMENTATION:
[Reference relevant chart notes, progress measurements, and clinical findings]

APPEAL RATIONALE:
[Explain why the denial should be overturned based on clinical documentation and payer policies]`;
}

/**
 * Get CPT code descriptions
 */
function getCPTDescriptions(codes: string[]): string[] {
  const descriptions: Record<string, string> = {
    '90837': 'Individual psychotherapy, 45 minutes',
    '90834': 'Individual psychotherapy, 45 minutes',
    '90891': 'Group psychotherapy',
    '97110': 'Therapeutic exercise, 15 minutes',
    '97112': 'Neuromuscular reeducation, 15 minutes',
    '97116': 'Gait training, 15 minutes',
    '97140': 'Manual therapy techniques, 15 minutes',
    '97150': 'Therapeutic procedure, 15 minutes',
    '97530': 'Therapeutic activities, 15 minutes',
    '97010': 'Hot/cold packs',
    '97014': 'Electrical stimulation',
    '97035': 'Ultrasound, 15 minutes'
  };

  return codes.map(code => descriptions[code] || `${code} procedure`);
}

function getCPTDescription(code: string): string {
  return getCPTDescriptions([code])[0] ?? `${code} procedure`;
}

function getICDDescription(code: string): string {
  return getICDDescriptions([code])[0] ?? `${code} diagnosis`;
}

/**
 * Get ICD-10 code descriptions
 */
function getICDDescriptions(codes: string[]): string[] {
  const descriptions: Record<string, string> = {
    'F33.1': 'Major depressive disorder, recurrent, moderate',
    'F41.1': 'Generalized anxiety disorder',
    'F45.1': 'Somatic symptom disorder with predominant pain',
    'M54.5': 'Low back pain',
    'M54.2': 'Neck pain',
    'M25.5': 'Pain in joint',
    'G83.1': 'Monoplegia, lower limb',
    'G82.2': 'Paraplegia',
    'S13.4': 'Sprain and strain of neck',
    'M79.3': 'Pain in limb'
  };

  return codes.map(code => descriptions[code] || `${code} diagnosis`);
}

/**
 * Format date for clinical documentation
 */
function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Generate clinical context from structured input
 */
export function generateFromStructured(structured: StructuredClinicalContext): string {
  const sections = [];

  sections.push('PRIMARY COMPLAINT/CLINICAL PRESENTATION:');
  sections.push(structured.primaryComplaint);
  sections.push('');

  if (structured.functionalLimitations.length > 0) {
    sections.push('FUNCTIONAL LIMITATIONS:');
    structured.functionalLimitations.forEach(limit => {
      sections.push(`- ${limit}`);
    });
    sections.push('');
  }

  if (structured.treatmentPlan.length > 0) {
    sections.push('TREATMENT PLAN:');
    structured.treatmentPlan.forEach(item => {
      sections.push(`- ${item}`);
    });
    sections.push('');
  }

  if (structured.progressMade.length > 0) {
    sections.push('PROGRESS DOCUMENTATION:');
    structured.progressMade.forEach(progress => {
      sections.push(`- ${progress}`);
    });
    sections.push('');
  }

  if (structured.goalsMet.filter(g => g).length > 0) {
    sections.push('GOALS ACHIEVED:');
    sections.push('Treatment goals have been met as documented in progress notes:');
    structured.goalsMet.forEach((met, index) => {
      if (met) {
        sections.push(`- Goal ${index + 1}: Achieved`);
      }
    });
    sections.push('');
  }

  if (structured.additionalNotes) {
    sections.push('ADDITIONAL CLINICAL NOTES:');
    sections.push(structured.additionalNotes);
  }

  return sections.join('\n');
}

/**
 * Parse clinical context into structured format
 */
export function parseToStructured(text: string): StructuredClinicalContext {
  const lines = text.split('\n');
  const structured: StructuredClinicalContext = {
    primaryComplaint: '',
    functionalLimitations: [],
    treatmentPlan: [],
    progressMade: [],
    goalsMet: [],
    additionalNotes: ''
  };

  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('PRIMARY COMPLAINT') || trimmed.startsWith('CLINICAL PRESENTATION')) {
      currentSection = 'primary';
      continue;
    }
    if (trimmed.startsWith('FUNCTIONAL LIMITATIONS')) {
      currentSection = 'functional';
      continue;
    }
    if (trimmed.startsWith('TREATMENT PLAN')) {
      currentSection = 'treatment';
      continue;
    }
    if (trimmed.startsWith('PROGRESS')) {
      currentSection = 'progress';
      continue;
    }
    if (trimmed.startsWith('ADDITIONAL')) {
      currentSection = 'notes';
      continue;
    }

    if (trimmed.startsWith('-')) {
      const content = trimmed.substring(1).trim();
      if (currentSection === 'functional') {
        structured.functionalLimitations.push(content);
      } else if (currentSection === 'treatment') {
        structured.treatmentPlan.push(content);
      } else if (currentSection === 'progress') {
        structured.progressMade.push(content);
      }
    } else if (trimmed) {
      if (currentSection === 'primary') {
        structured.primaryComplaint += (structured.primaryComplaint ? ' ' : '') + trimmed;
      } else if (currentSection === 'notes') {
        structured.additionalNotes += (structured.additionalNotes ? ' ' : '') + trimmed;
      }
    }
  }

  return structured;
}
