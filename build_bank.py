"""Builds data/questions.json (the 60-question bank) from the authored list below and validates it
against the ten approved decks (slide numbers, objective text, arithmetic).
Run:  python3 build_bank.py
"""
import json, re, sys, os
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")

# s=session, o=objective number (1-5, per slide 2 of that deck), t=type, q=question, a=correct, w=three wrong, e=explanation, sl=source slide number
Q = []
def add(s, o, t, q, a, w, e, sl):
    Q.append(dict(s=s, o=o, t=t, q=q, a=a, w=w, e=e, sl=sl))

# ---------------------------------------------------------------- Session 1: US healthcare landscape
add(1, 1, "scenario",
    "Maria feels unusually thirsty and tired. Her clinician orders a blood test to find out the cause. Which purpose of healthcare does this test mainly serve?",
    "Diagnosis", ["Prevention", "Treatment", "Rehabilitation"],
    "A test ordered to find the cause of symptoms is diagnosis. Prevention is about keeping problems from starting, treatment is about managing or curing them, and rehabilitation is about regaining function.", 6)
add(1, 2, "scenario",
    "Maria has a minor cut and a mild fever. Her life is not at risk, but she needs same-day treatment. Which type of care fits best?",
    "Urgent care", ["Emergency care", "Tertiary care", "Hospice care"],
    "Urgent care is for non-life-threatening problems that need prompt attention. Emergency care is for life-threatening conditions; the quick test is 'is life at risk?'.", 9)
add(1, 2, "spot-the-error",
    "A trainee writes: 'Palliative care and hospice care are the same thing.' Which correction is best?",
    "Palliative care can be given to anyone living with a serious illness; hospice focuses on comfort and quality of life in terminal illness",
    ["Palliative care is only for children; hospice is only for adults",
     "Hospice care aims to cure the illness; palliative care only manages pain",
     "Palliative care is another name for emergency care"],
    "Palliative care supports people with a serious illness (symptom relief, emotional support, care coordination). Hospice care focuses on comfort and quality of life in terminal illness.", 10)
add(1, 3, "concept",
    "A new analyst asks why coverage and billing data matter so much in US healthcare. Which answer best reflects how the system works?",
    "Insurance shapes access, cost per case, provider networks and what patients pay, so coverage and billing data drive many decisions",
    ["One national insurer sets every price, so billing data only matters to the government",
     "Hospitals are never paid by insurers, so billing data only describes patients' own payments",
     "Insurance has little effect on access; only the patient's income does"],
    "The US system is a mix of public and private payers and providers, and insurance strongly shapes access, cost and what patients pay.", 11)
add(1, 4, "best-next-action",
    "Maria's PCP, endocrinologist and urgent care each keep her data in a different system, and the systems cannot share it consistently. Which challenge is this, and what helps address it?",
    "Interoperability; shared standards such as HL7 and FHIR help systems exchange data",
    ["Rising costs; adding more billing staff removes the problem",
     "Data volume; deleting older records removes the problem",
     "Access gaps; removing insurance rules removes the problem"],
    "Systems that cannot share data consistently are an interoperability problem. Standards such as HL7, FHIR and DICOM are part of the technology response.", 12)
add(1, 5, "scenario",
    "A new colleague says, 'Healthcare IT just means the hospital help desk.' Which description is more accurate?",
    "Digital systems and technologies used to store, manage, exchange and analyse healthcare information",
    ["Only the machines used to take medical images",
     "Only the software a patient uses to book appointments",
     "Only the insurance company's claims computers"],
    "Healthcare IT covers the digital systems used to store, manage, exchange and analyse healthcare information, such as EHRs, HIE, portals, imaging systems and analytics platforms.", 13)

# ---------------------------------------------------------------- Session 2: stakeholders and organizations
add(2, 1, "scenario",
    "A company hosts Maria's clinic's EHR and handles her PHI under a written agreement with the clinic. Which stakeholder type fits the company best?",
    "Business associate", ["Payer", "Clearinghouse", "Regulator"],
    "A third party that performs a service involving PHI on behalf of a healthcare entity is a business associate and must follow HIPAA privacy and security rules.", 13)
add(2, 2, "scenario",
    "Maria is covered under an insurance policy held by her spouse. Which statement describes the roles correctly?",
    "Her spouse is the subscriber; Maria is a member and also the patient when she receives care",
    ["Maria is the subscriber, because the patient always holds the policy",
     "Her spouse is the patient, because the policyholder pays the premium",
     "Maria is the guarantor, because guarantor means enrolled in the plan"],
    "The subscriber holds the policy, a member is enrolled in the plan, the patient receives care, and the guarantor is financially responsible for the bill. One person can hold several roles.", 11)
add(2, 3, "concept",
    "After Maria's visit to the endocrinologist, her insurance covers part of the bill. Which description of the money flow matches the deck's commercial-plan example?",
    "The payer pays the provider its share, and the provider bills Maria for the balance",
    ["The payer pays Maria, and Maria pays the provider",
     "The clearinghouse pays the provider and then bills the payer",
     "The regulator pays the provider and bills Maria"],
    "Information and money take different paths. The payer sits in the middle: it pays the provider its share and the provider bills the patient for the balance.", 22)
add(2, 4, "scenario",
    "An emergency room needs Maria's allergy history from other providers' systems. Which kind of organization exists mainly to help share patient data securely across providers?",
    "Health Information Exchange (HIE)",
    ["Independent Physician Association (IPA)", "Accountable Care Organization (ACO)", "Integrated Delivery Network (IDN)"],
    "An HIE shares patient data securely across providers. An ACO shares accountability for quality and cost, an IPA shares business resources, and an IDN shares management.", 16)
add(2, 5, "concept",
    "A company builds and runs analytics platforms for hospitals and handles their PHI. Which statement best describes where it sits in the ecosystem?",
    "It supplies systems and services to providers and payers, and is often a business associate when it handles PHI for them",
    ["It is a regulator, because it sets rules for how hospitals use data",
     "It is a payer, because it works with claims data",
     "It is a provider, because it handles clinical information"],
    "Healthcare technology organizations supply systems and services to providers, payers and others, and are often business associates when they handle PHI on their behalf.", 15)
add(2, 1, "spot-the-error",
    "A trainee writes: 'Clearinghouses decide how much the insurer will pay.' What is wrong with this statement?",
    "Clearinghouses check, standardise and send claims; the payer reviews the claim and decides payment",
    ["Nothing; clearinghouses make the final payment decision",
     "Clearinghouses treat patients, so they cannot decide payment",
     "Clearinghouses only store claims for the regulator"],
    "A clearinghouse scrubs claims, converts them to standard formats and sends them securely to payers. The payer decides how much to pay.", 12)

# ---------------------------------------------------------------- Session 3: insurance, patient costs and payment
add(3, 1, "concept",
    "A low-income family asks which government programme might cover them. The deck notes that eligibility rules vary by state. Which programme fits?",
    "Medicaid", ["Medicare", "An employer-sponsored plan", "A Marketplace plan with no subsidy"],
    "Medicaid is a joint federal and state programme for low-income individuals and families, with eligibility rules that vary by state. Medicare mainly covers people aged 65 and over and some people with disabilities.", 6)
add(3, 2, "spot-the-error",
    "A colleague says that everything Maria pays counts toward her out-of-pocket maximum. Which cost does NOT count toward it?",
    "Her monthly premium", ["Her deductible payments", "Her coinsurance for covered in-network care", "Her copayments for covered care"],
    "Premiums do not count toward the out-of-pocket maximum. Deductibles, copays and coinsurance for covered care usually do (check the plan).", 9)
add(3, 3, "calculation",
    "Maria's plan has a $40 specialist copay that is not subject to the deductible. A covered in-network specialist visit has a billed charge of $350 and an allowed amount of $250. How much does the insurer pay?",
    "$210", ["$250", "$310", "$40"],
    "Cost-sharing starts from the allowed amount, not the billed charge. Maria pays the $40 copay, so the insurer pays $250 - $40 = $210.", 22)
add(3, 3, "calculation",
    "Maria's covered in-network service has an allowed amount of $2,000. She still has $500 of her deductible to meet, then pays 20% coinsurance. She is far from her out-of-pocket maximum. How much does Maria owe?",
    "$800", ["$400", "$500", "$900"],
    "Maria pays the $500 deductible first. The remaining allowed amount is $1,500, and 20% of $1,500 is $300. Her total is $500 + $300 = $800. Coinsurance applies only after the deductible.", 15)
add(3, 4, "concept",
    "Maria receives an envelope from her insurer after a visit. It lists the billed amount, the allowed amount, what the insurer paid and what she may owe, and states 'This is not a bill'. What is this document?",
    "An explanation of benefits (EOB)", ["A bill from the provider", "A prior authorization approval", "A claim sent to the clearinghouse"],
    "An EOB comes from the insurer and explains how a claim was processed. It is not a bill; the provider's bill arrives later and should match it.", 13)
add(3, 5, "concept",
    "A health system receives one fixed payment per person in advance to cover a defined set of services for that person. Which value-based payment model is this?",
    "Capitation", ["Bundled payment", "Pay for performance", "Shared savings"],
    "Capitation is a fixed payment per person in advance for defined services. A bundled payment covers one episode of care, pay for performance links payment to targets, and shared savings rewards lower cost with quality.", 26)

# ---------------------------------------------------------------- Session 4: healthcare IT systems
add(4, 1, "scenario",
    "Maria logs her glucose readings in a phone app, and she decides who can see them. Which type of record is this?",
    "A personal health record (PHR)", ["An electronic medical record kept by a clinic", "A health information exchange", "A laboratory information system"],
    "A PHR is kept and controlled by the patient. An EMR or EHR is kept by provider organizations, and an HIE shares information between organizations.", 5)
add(4, 2, "scenario",
    "A radiology department needs to store and retrieve Maria's CT images so radiologists and clinicians can review them. Which system does this?",
    "PACS (picture archiving and communication system)", ["LIS (laboratory information system)", "Practice management and billing system", "Patient portal"],
    "PACS stores and retrieves images. The RIS manages imaging scheduling and reports, the LIS handles lab orders and results, and the portal lets patients view and message.", 9)
add(4, 3, "sequence",
    "Dr. Chen orders an HbA1c test for Maria. Which sequence best shows the path of the order and result?",
    "EHR (order), LIS (lab processes), EHR (result returns), portal (Maria may see it)",
    ["Portal (order), EHR (lab processes), LIS (result returns), analytics",
     "LIS (order), portal (lab processes), EHR (result returns), PACS",
     "EHR (order), PACS (lab processes), LIS (result returns), clearinghouse"],
    "The clinician orders in the EHR, the lab works in the LIS, the result returns to the EHR, and the portal may show it depending on settings. Analytics may use copies later.", 12)
add(4, 4, "scenario",
    "A hospital still runs an older system that is hard to connect to newer products. Which cause of data fragmentation does this describe?",
    "Legacy systems", ["Different vendors", "Inconsistent data", "Separate workflows"],
    "Older systems that stay in use and are hard to connect are legacy systems. Other causes are different vendors, inconsistent data and separate workflows.", 15)
add(4, 5, "concept",
    "Maria views her HbA1c result in the patient portal. Where was that result data first created, according to the deck?",
    "In the lab: the analyzer measures it and the LIS records and manages the result; the portal only displays it",
    ["In the portal, when Maria opens the result",
     "In the EHR, when the clinician reads it",
     "In the analytics platform, when reports are built"],
    "Origin is where information is first created. Storage and display come later; a portal usually displays data created in another system.", 23)
add(4, 2, "scenario",
    "A front-desk team schedules Maria's appointments, and a billing team prepares her charges and claim. Which system mainly supports these tasks?",
    "Practice management and billing system", ["Radiology information system (RIS)", "Laboratory information system (LIS)", "Pharmacy system"],
    "Practice management and billing systems handle scheduling, charges, claims and statements for front-desk and billing staff.", 10)

# ---------------------------------------------------------------- Session 5: data lifecycle, PHI and HIPAA
add(5, 1, "scenario",
    "A copy of Maria's HbA1c result is matched to her record and loaded into a reporting database. Which data lifecycle stage is this?",
    "Processing", ["Capture", "Exchange", "Disposal"],
    "Processing is when data is matched, coded, copied or calculated. Capture is creation, exchange is sending to other systems or organizations, and disposal is secure destruction.", 7)
add(5, 2, "scenario",
    "Maria's clinic hires a billing company that handles her claims and therefore sees her PHI. Which description is best?",
    "The clinic is a covered entity; the billing company is likely a business associate that needs a written agreement",
    ["Both are health plans, so no agreement is needed",
     "Neither has HIPAA duties, because the data is already in the EHR",
     "The billing company is the covered entity and the clinic is its business associate"],
    "A provider that conducts certain electronic transactions is a covered entity. A party performing a service involving PHI on its behalf is a business associate and needs a written agreement (BAA).", 10)
add(5, 3, "concept",
    "A clinic discovers that unsecured PHI was exposed. Which statement about notifying the affected individuals is correct?",
    "They must be notified without unreasonable delay and no later than 60 days after discovery; other notification deadlines vary",
    ["Only if an individual asks about it",
     "Within 24 hours in every case, with no exceptions",
     "Only after the clinic has finished its annual risk analysis"],
    "The Breach Notification Rule requires notice to affected individuals without unreasonable delay and no later than 60 days after discovery of a breach of unsecured PHI. Other deadlines vary.", 11)
add(5, 4, "spot-the-error",
    "A colleague says: 'Minimum necessary means we must limit the labs we send to a specialist who is treating Maria.' What is wrong?",
    "The minimum necessary principle does not apply to disclosures to, or requests by, a provider for treatment",
    ["Nothing; minimum necessary always applies to treatment",
     "Specialists are never allowed to receive labs",
     "Minimum necessary only applies to paper records"],
    "Minimum necessary has a treatment exception: clinicians get what they need to treat. It does apply to many other uses, such as a billing clerk asking for a full chart.", 13)
add(5, 4, "best-next-action",
    "A staff member opened Maria's record out of curiosity, with no work reason. What is the best next step?",
    "Stop, do not hide it, and report it promptly through the organization's process",
    ["Close the record and say nothing, since no one saw it",
     "Tell Maria informally and let her decide whether to report it",
     "Wait to see whether anyone notices before reporting"],
    "Access beyond job need is inappropriate. The right step is to stop and report promptly; the privacy or compliance team decides what counts as a breach.", 22)
add(5, 5, "best-next-action",
    "An analyst removes names from a diabetes extract but keeps visit dates and 5-digit ZIP codes, then wants to share it as 'de-identified'. What should happen next?",
    "Do not share it as de-identified; ask privacy or compliance, because de-identification needs a recognised HIPAA method",
    ["Share it, because names are the only identifiers that matter",
     "Share it, because ZIP codes and dates are not identifying",
     "Share it, because the recipient is outside the organization"],
    "Removing names alone does not de-identify data; dates and ZIP codes can still identify people. HIPAA recognises specific methods, and privacy or compliance decides.", 23)

# ---------------------------------------------------------------- Session 6: interoperability and HL7
add(6, 1, "scenario",
    "Both a lab and Maria's clinic use EHRs, yet her result arrives as an unreadable attachment. Which statement fits the deck's definition of interoperability?",
    "The data was exchanged but not usefully used; interoperability needs both exchange and meaningful use",
    ["It is interoperable, because the result was delivered",
     "It is interoperable, because both organizations own an EHR",
     "Interoperability only means that two systems have a network connection"],
    "Interoperability is exchange plus meaningful use. A delivered result that cannot be read or used has not achieved it.", 5)
add(6, 2, "concept",
    "Which statement best matches the deck's description of HL7 v2, CDA and FHIR?",
    "HL7 v2: short event messages made of segments; CDA: structured clinical documents; FHIR: modular resources and web APIs",
    ["HL7 v2: structured clinical documents; CDA: modular web APIs; FHIR: short event messages",
     "All three are the same standard under different names",
     "FHIR has replaced HL7 v2 and CDA, which are no longer used"],
    "The three standards have different shapes and uses, and they coexist. FHIR is itself an HL7 standard and does not make the others obsolete.", 9)
add(6, 3, "spot-the-error",
    "In the sample message, the line is OBX|1|NM|4548-4^HbA1c^LN||7.2|%|4.0-5.6|H|||F|||20261002083000. Which statement about this segment is correct?",
    "It is the OBX segment, and it carries the result value 7.2 with its unit",
    ["It is the PID segment, and it identifies the patient Maria Lopez",
     "It is the MSH segment, and it names the sending application",
     "It is the OBR segment, and it describes the test that was ordered"],
    "OBX carries the observation result: the test identifier, value, unit, reference range and status. PID identifies the patient, MSH is the header, and OBR describes the request.", 15)
add(6, 4, "concept",
    "Which task is a typical function of an integration engine sitting between the LIS and the EHR?",
    "Receive messages, validate them, transform or map them if needed, route them and monitor delivery",
    ["Decide whether the patient's insurance covers the test",
     "Create the lab result from the sample when the analyzer is busy",
     "Replace the EHR as the patient's legal medical record"],
    "An integration engine receives, validates, transforms, routes and monitors messages. It does not produce results, decide coverage or replace the record.", 18)
add(6, 5, "best-next-action",
    "The EHR returned an acknowledgement with code AA for Maria's result, but Dr. Chen cannot find it in her chart two days later. What is the best next step?",
    "Check whether the result matched the right patient, for example in an unmatched-results queue; AA only shows the application accepted the message",
    ["Nothing; AA proves the result reached Dr. Chen's chart correctly",
     "Ask the lab to resend the result, since AA means the message was lost",
     "Conclude that HL7 failed and replace it with FHIR"],
    "An AA acknowledgement means the receiving application accepted the message. It does not prove correct patient matching, interpretation or clinical workflow.", 25)
add(6, 4, "spot-the-error",
    "A teammate says: 'The message is valid HL7 v2, so every receiving system will interpret the test the same way.' What is the flaw?",
    "HL7 v2 gives structure; shared meaning also depends on agreed codes and units, such as LOINC for the test",
    ["Valid HL7 v2 messages cannot contain test codes",
     "Meaning is guaranteed by the pipe and caret characters",
     "Only CDA documents can identify a lab test"],
    "Structure is not meaning. Systems need shared terminology such as LOINC, plus correct units, to treat results as the same test.", 19)

# ---------------------------------------------------------------- Session 7: terminology and code sets
add(7, 1, "scenario",
    "Three labs send Maria's test as 'A1C', 'HbA1c' and 'Hemoglobin A1c'. Why would the clinic want one shared standard code?",
    "So every system can recognise, count and compare the results as the same test",
    ["So the result values become more accurate",
     "So the labs no longer need to report units",
     "So the claim for the test is automatically paid"],
    "A shared code identifies the concept, not just the words. It does not change the value, remove the need for units or guarantee payment.", 5)
add(7, 2, "scenario",
    "Maria's clinic wants a detailed clinical concept for her problem list, while her claim needs a classified diagnosis. Which two systems fit best?",
    "SNOMED CT for the clinical concept; ICD-10-CM for the claim diagnosis",
    ["ICD-10-CM for the clinical concept; SNOMED CT for the claim diagnosis",
     "CPT for the clinical concept; HCPCS Level II for the claim diagnosis",
     "LOINC for the clinical concept; RxNorm for the claim diagnosis"],
    "SNOMED CT is a detailed clinical terminology; ICD-10-CM classifies diagnoses for claims and statistics. LOINC identifies lab tests and RxNorm identifies drugs.", 11)
add(7, 3, "scenario",
    "Maria's clinic supplies her with a home glucose meter. Which system is most likely to describe this item on a claim?",
    "HCPCS Level II", ["CPT", "ICD-10-PCS", "RxNorm"],
    "HCPCS Level II codes supplies, equipment, drugs and services not in CPT. ICD-10-PCS is for inpatient hospital procedures and RxNorm normalises drug names.", 11)
add(7, 4, "concept",
    "Which statement about mapping local codes to standard codes is correct?",
    "A mapping needs review by someone who understands both sides; some mappings are one-to-many or many-to-one and can lose detail",
    ["If two names look alike, the codes are equivalent and no review is needed",
     "Every local code maps to exactly one standard code with no loss of detail",
     "A mapping, once built, never needs to be revisited"],
    "Similar names do not mean equivalent concepts. Mappings are not always one-to-one and must be checked and maintained.", 13)
add(7, 5, "scenario",
    "A result of 7.2 arrives for Maria's HbA1c with no unit. What is the most likely effect on reports?",
    "It cannot be interpreted with confidence and may be dropped or misused",
    ["It is automatically treated as a percentage and counted correctly",
     "It is converted to the right unit by the HL7 header",
     "It has no effect, because the test code is enough"],
    "A missing unit changes meaning. Analysts may exclude the record or, worse, include it wrongly.", 14)
add(7, 5, "best-next-action",
    "A coder is asked to choose a diagnosis code for Maria's visit, but the note says only 'follow-up, doing OK'. What is the best next step?",
    "Ask the clinician for clarification; do not guess a code from insufficient documentation",
    ["Choose the most common diabetes code, since she has diabetes",
     "Reuse the code from her last visit",
     "Leave the diagnosis out and submit the claim anyway"],
    "Codes must follow the documentation and the applicable coding rules. When documentation is insufficient, the usual practice is to ask the clinician, not to guess.", 11)

# ---------------------------------------------------------------- Session 8: claims workflow and revenue cycle
add(8, 1, "scenario",
    "The front desk collects Maria's copay when she arrives. Which statement is correct?",
    "It is part of the revenue cycle, but not part of the lifecycle of the claim",
    ["It is part of the claim lifecycle only",
     "It is not part of the revenue cycle, because no claim exists yet",
     "It is part of the clearinghouse's work"],
    "The revenue cycle covers the whole financial process from registration to follow-up, including steps that are not claims. The claim lifecycle is the journey of one claim.", 6)
add(8, 2, "scenario",
    "A clinic sends its claims directly to a payer without using a clearinghouse. Which statement is correct?",
    "That can be done; a clearinghouse is a common intermediary but not mandatory in every arrangement",
    ["That is not possible; every claim must pass through a clearinghouse",
     "That is only possible for Medicare claims",
     "That means the claim skips payer adjudication"],
    "Claims can be submitted directly or through clearinghouses. Arrangements vary.", 9)
add(8, 3, "scenario",
    "A payer paid one of the two services on a claim and denied the other as not covered, with a stated reason on the remittance. What is the best description and next step?",
    "Partly paid; read the reason, then correct, add information or appeal, and do not bill Maria for the denied service automatically",
    ["Rejected; correct the format and resubmit, and bill Maria for the denied service",
     "Pending; wait for the payer's decision",
     "Paid in full; post the payment and close the account"],
    "Part of the claim was not paid for a reason other than normal cost sharing. The reason decides the action, and a denied amount does not automatically become the patient's responsibility.", 12)
add(8, 4, "calculation",
    "Maria's in-network claim has a billed charge of $900 and an allowed amount of $600. She has $100 of her deductible left, then pays 20% coinsurance. How much does the payer pay?",
    "$400", ["$480", "$600", "$700"],
    "Maria's share is $100 + 20% x ($600 - $100) = $100 + $100 = $200. The payer pays $600 - $200 = $400, and the $300 contractual adjustment is not billed. Check: $400 + $200 = $600 allowed; $400 + $200 + $300 = $900 billed.", 15)
add(8, 4, "concept",
    "Maria's insurer sends her a statement marked 'This is not a bill', and the clinic receives a remittance advice for the same claim. Which statement is correct?",
    "The EOB goes to the patient to explain how the claim was processed; the remittance advice goes to the provider to post payments and adjustments",
    ["Both go to the patient, and both are bills",
     "The remittance advice goes to the patient; the EOB goes to the provider",
     "Both go to the clearinghouse, which then bills Maria"],
    "An EOB explains processing to the patient and is not a bill. The remittance advice explains payment to the provider; the provider's own statement is the bill.", 16)
add(8, 5, "concept",
    "A team wants to send Maria's claim electronically and later read the payer's payment explanation electronically. Which pair of X12 transactions fits?",
    "837 to send the claim; 835 for the electronic remittance advice",
    ["835 to send the claim; 837 for the electronic remittance advice",
     "270 to send the claim; 271 for the remittance advice",
     "ORU^R01 to send the claim; ACK for the remittance advice"],
    "837 carries a claim, 835 is the electronic remittance advice, and 270/271 are eligibility inquiry and response. ORU and ACK are HL7 clinical messages.", 17)

# ---------------------------------------------------------------- Session 9: quality, value-based care and analytics
add(9, 1, "concept",
    "Which of these is a process measure?",
    "The share of adults with diabetes who had an HbA1c test during the year",
    ["The clinic has an EHR with a diabetes registry",
     "The share of adults with diabetes whose latest HbA1c is above a threshold",
     "The number of nurses per patient"],
    "A process measure looks at what is done for patients. The registry and nurse staffing are structure measures; the latest HbA1c value is an intermediate outcome.", 6)
add(9, 2, "calculation",
    "In an illustrative training measure, 120 adults with diabetes are eligible and 6 are excluded. Of the denominator, 19 have a latest HbA1c above the threshold and 12 have no result. Patients with no result stay in the denominator. What is the rate above the threshold?",
    "16.7%", ["15.8%", "18.6%", "10.5%"],
    "Denominator = 120 - 6 = 114. Rate = 19 / 114 = 16.7%. 15.8% forgets the exclusions (19/120), 18.6% drops the no-result patients (19/102), and 10.5% is the no-result share (12/114).", 9)
add(9, 2, "scenario",
    "Maria's latest HbA1c is 7.2%, below the training threshold. The clinic's report shows 20% of its patients above the threshold. Which statement is correct?",
    "The 20% describes the group; Maria is simply counted as not above the threshold",
    ["Maria has a 20% chance of being above the threshold",
     "Maria is 20% above the threshold",
     "The report proves Maria's care is ideal"],
    "A population rate describes a group, not any one person. A person is either counted in the numerator or not.", 8)
add(9, 3, "concept",
    "Which statement about ACOs with downside risk is correct?",
    "A two-sided arrangement can share savings and may also owe shared losses; rules differ by programme, track and year",
    ["Downside risk means the ACO can never share in savings",
     "An upside-only ACO repays Medicare whenever spending runs above its benchmark",
     "All ACOs operate under the same rules and risk levels"],
    "In a two-sided arrangement an ACO can share savings and may owe losses. An upside-only arrangement does not repay losses. Rules differ across programmes and tracks.", 11)
add(9, 4, "scenario",
    "An analyst builds a diabetes report using only claims data and tries to report each patient's latest HbA1c value. What is the main problem?",
    "Claims carry billed services, codes and costs, not the lab result values themselves",
    ["Claims data always contains the exact result value, but it arrives too early",
     "Claims data cannot show any diagnosis at all",
     "Claims data is only available for patients with no insurance"],
    "Claims data can show services billed and paid, but cannot establish lab values or clinical detail. Lab and EHR data hold the results.", 14)
add(9, 5, "best-next-action",
    "Clinic A's rate above the threshold is lower than Clinic B's. Which action is best before saying Clinic A provides better care?",
    "Check that both use the same definitions and period, serve comparable patients, have enough patients and have complete data",
    ["Accept it, because a lower rate always means better care",
     "Accept it, because risk adjustment removes every difference between clinics",
     "Reject it, because rates can never be compared"],
    "Comparisons need consistent definitions and comparable populations. Risk adjustment helps, but it does not remove every difference.", 16)

# ---------------------------------------------------------------- Session 10: AI, responsible use and careers
add(10, 1, "scenario",
    "A tool learns from past appointment data to estimate which patients are more likely to miss visits. Which kind of tool is it?",
    "Predictive machine learning", ["Rule-based automation", "Generative AI", "A clinically validated decision system"],
    "Predictive ML learns patterns from past data to estimate a likelihood. Rule-based tools follow fixed if-then rules, and generative AI creates new content. Nothing here shows clinical validation.", 5)
add(10, 2, "best-next-action",
    "A vendor says its AI tool is 'FDA-approved' and therefore safe for every use. What is the best response?",
    "Ask what it is for, who evaluated it, in which setting and on which patients, and whether FDA has authorized this specific use",
    ["Accept the claim, because all healthcare AI is FDA-approved",
     "Accept the claim, because any AI tool in a hospital has been clinically validated",
     "Ignore the claim, because FDA never reviews AI software"],
    "FDA regulates some AI-enabled software as a medical device and lists authorized ones, but not all healthcare AI is FDA-authorized, and an authorization applies to a specific use.", 7)
add(10, 3, "scenario",
    "A risk model built on one hospital's data is used at a rural clinic with different patients and local codes, and its estimates become less reliable. Which limitation is this?",
    "Performance can change across populations and settings",
    ["Generative AI inventing a source document",
     "A privacy breach in the training data",
     "A rule-based tool following its rules too literally"],
    "A model can behave differently in another population or setting, and can drift over time. The key question is whether it was tested on patients like ours, in settings like ours.", 10)
add(10, 4, "concept",
    "Which statement about patient information and approved AI tools is correct?",
    "Identifiable patient information remains PHI even when its use is approved; use it only through tools and workflows approved for that purpose and data",
    ["Once a use is approved, the information is no longer PHI",
     "Removing the patient's name is enough to make any note de-identified",
     "Information is only PHI while it is on paper"],
    "Approval is permission to use PHI through approved tools and workflows; it does not change what the information is. Properly de-identified information is no longer PHI.", 11)
add(10, 4, "concept",
    "An organization has a person review every AI-drafted note, but the reviewer has no access to the source record and about ten seconds per note. Which statement is correct?",
    "Human review does not automatically make AI use safe; reviewers need time, source access, knowledge and authority",
    ["The review makes the use safe, because a human checked it",
     "The review is unnecessary, because approved tools are always correct",
     "The review proves the notes are clinically validated"],
    "Oversight must be real. A rushed review without source access adds little safety, and review does not make an output clinically validated.", 12)
add(10, 5, "concept",
    "A learner asks which healthcare technology career path will pay the most and be most in demand. Which response matches the session?",
    "No verified evidence is offered on pay or demand; domain knowledge, data skills, clear explanation and the habit of checking apply across paths",
    ["Data scientist roles always pay the most and are guaranteed to be available",
     "Healthcare technology jobs are being replaced by AI, so avoid them",
     "Only people with a clinical degree can work in healthcare technology"],
    "The session gives example paths and skills only, with no salary figures, hiring forecasts or promises of jobs.", 20)


# ===================================================================== reviewer corrections (round 1)
# Applied on top of the authored list: keyed by question id (session order). a = correct, w = three distractors.
_cnt = defaultdict(int)
for _x in Q:
    _cnt[_x["s"]] += 1; _x["id"] = f"S{_x['s']:02d}-Q{_cnt[_x['s']]}"
OV = {
 "S01-Q2": dict(q="Maria has a minor cut and a mild fever. Nothing suggests a serious threat to her health, but she needs same-day treatment. Which type of care fits best?",
    e="Urgent care is for problems that need prompt attention but do not threaten life or risk serious impairment. Emergency care is for conditions that could seriously endanger health, including serious impairment or organ dysfunction."),
 "S01-Q3": dict(a="Palliative care can start at any stage of serious illness; hospice is for terminal illness",
    w=["Palliative care is for children only, while hospice is for adults of any age and condition", "Hospice care aims to cure the illness, while palliative care only manages pain medication", "Palliative care is a hospital-only service, while hospice is delivered only in nursing homes"]),
 "S01-Q4": dict(a="Insurance shapes access, provider networks and patient cost, so coverage and billing data drive many decisions",
    w=["One national insurer sets every price, so billing data matters only to government planners", "Hospitals are paid by patients only, so billing data describes personal spending rather than care", "Insurance has little effect on access, because income alone decides which care people receive"]),
 "S01-Q5": dict(a="Interoperability; standards such as HL7 and FHIR help systems share data",
    w=["Rising costs; hiring more billing staff would remove the data problem", "Data volume; deleting older records would remove the data problem", "Access gaps; changing insurance rules would remove the data problem"]),
 "S01-Q6": dict(a="Digital systems used to store, manage, exchange and analyse healthcare information",
    w=["Only the imaging machines that capture scans, such as MRI and CT equipment", "Only the patient-facing apps used to book and reschedule appointments online", "Only the insurer's claims computers that process payments and denials"]),
 "S02-Q1": dict(a="Business associate", w=["Health plan (payer)", "Healthcare clearinghouse", "Government regulator"]),
 "S02-Q2": dict(a="Her spouse is the subscriber; Maria is a member and, when she receives care, the patient",
    w=["Maria is the subscriber, because the person receiving care always holds the policy", "Her spouse is the patient, because the policyholder is always the one who receives care", "Maria is the guarantor, because guarantor means enrolled in the health plan"]),
 "S02-Q3": dict(a="The payer pays the provider its share; the provider bills Maria her patient responsibility after payments and adjustments",
    w=["The payer pays Maria her share of the bill, and Maria then passes the full charge on to the provider", "The clearinghouse pays the provider first, then collects the unpaid balance from the payer and from Maria", "The regulator pays the provider and then bills Maria for anything the payer did not cover"],
    e="Information and money take different paths. The payer sits in the middle: it pays the provider its share, and the provider bills the patient for her patient responsibility after applicable payments and adjustments, not automatically for the whole unpaid balance."),
 "S02-Q5": dict(a="It supplies systems and services to providers and payers, and is often a business associate",
    w=["It is a regulator, because it sets the rules hospitals must follow when using data", "It is a payer, because it works with claims data and reimbursement files", "It is a provider, because it handles clinical information about patients"]),
 "S02-Q6": dict(a="Clearinghouses check, standardise and send claims; the payer reviews them and decides payment",
    w=["Nothing; clearinghouses review each claim and make the final payment decision for the payer", "Clearinghouses decide payment only when the claim is under a set dollar amount", "Clearinghouses only archive claims for regulators and never pass them on to payers"]),
 "S03-Q4": dict(e="Maria pays the $500 deductible first. The remaining allowed amount is $1,500, and 20% of $1,500 is $300. Her total is $500 + $300 = $800. In this scenario, coinsurance applies to the amount remaining after the deductible."),
 "S04-Q2": dict(a="PACS (picture archiving and communication system)",
    w=["LIS (laboratory information system for lab results)", "Practice management and billing system for charges", "Patient portal for messaging and viewing results"]),
 "S04-Q3": dict(a="EHR (order), LIS (lab processes), EHR (result returns), portal (Maria may see it)",
    w=["Portal (order), EHR (lab processes), LIS (result returns), analytics (clinician reads it)", "LIS (order), portal (lab processes), EHR (result returns), PACS (Maria may see it)", "EHR (order), PACS (lab processes), LIS (result returns), clearinghouse (Maria may see it)"]),
 "S04-Q5": dict(a="In the lab, where the analyzer measures it and the LIS records it; the portal only displays it",
    w=["In the portal, because that is where Maria opens and reads the result for the first time", "In the EHR, because the clinician sees and signs off the result there before anyone else", "In the analytics platform, because reports are built from the data after it arrives"]),
 "S04-Q6": dict(a="Practice management and billing system", w=["Picture archiving and communication system (PACS)", "Laboratory information system (LIS)", "Pharmacy information system"]),
 "S05-Q2": dict(q="Maria's clinic conducts HIPAA-standard electronic transactions, such as billing insurers electronically. It hires a billing company that handles her claims and therefore sees her PHI. Which description is best?",
    a="The clinic is a covered entity; the billing company is likely a business associate under a written agreement",
    w=["Both are covered entities as health plans, so no written agreement is needed between them", "Neither has HIPAA duties, because the data already sits in the clinic's EHR and is shared for payment", "The billing company is the covered entity and the clinic is its business associate under the agreement"],
    e="A health care provider is a covered entity when it conducts HIPAA-standard electronic transactions; being a clinic alone does not establish this. A party performing a service involving PHI on the covered entity's behalf is a business associate and needs a written agreement (BAA)."),
 "S05-Q3": dict(q="A clinic discovers a reportable breach of unsecured PHI. Which statement about notifying the affected individuals is correct?",
    a="Without unreasonable delay and no later than 60 days after discovery; other deadlines may vary",
    w=["Only when an affected individual asks whether their own record was involved", "Within 24 hours of discovery in every case, whatever the size or type of the breach", "Only after the clinic has finished its annual security risk analysis for the year"],
    e="For a reportable breach of unsecured PHI, the Breach Notification Rule requires notice to affected individuals without unreasonable delay and no later than 60 days after discovery. Other notification deadlines vary. Not every exposure of PHI is a reportable breach; the privacy or compliance team decides."),
 "S05-Q4": dict(a="Minimum necessary does not apply to disclosures to a provider for treatment",
    w=["Nothing; minimum necessary always limits what can be sent for treatment", "Specialists are never allowed to receive lab results from another clinic", "Minimum necessary only applies to paper records, not to electronic ones"]),
 "S05-Q5": dict(a="Stop, do not hide it, and report it promptly through the organization's process",
    w=["Close the record quietly and say nothing, since nobody else saw it being opened", "Tell Maria informally and let her decide whether anyone should be notified", "Wait a few days to see whether anyone notices before deciding to report"]),
 "S05-Q6": dict(a="Do not call it de-identified; ask privacy or compliance, since HIPAA requires a recognised method",
    w=["Share it as de-identified, because names are the only identifiers that matter for privacy", "Share it as de-identified, because ZIP codes and dates are too general to identify anyone", "Share it, because the recipient is outside the organization and cannot link it back"]),
 "S06-Q1": dict(a="Exchanged but not usefully used: interoperability needs both exchange and meaningful use",
    w=["It is interoperable, because delivery of the result is all the definition requires", "It is interoperable, because both organizations own an EHR that follows a standard", "Interoperability only means two systems have a working network connection between them"]),
 "S06-Q2": dict(a="HL7 v2: event messages of segments; CDA: clinical documents; FHIR: modular resources and web APIs",
    w=["HL7 v2: clinical documents; CDA: modular resources and web APIs; FHIR: event messages of segments", "HL7 v2: modular resources and web APIs; CDA: event messages of segments; FHIR: clinical documents", "FHIR has replaced both HL7 v2 and CDA, so neither is still used in live systems"]),
 "S06-Q3": dict(w=["It is the PID segment, and it carries the patient's name and date of birth", "It is the MSH segment, and it names the sending and receiving applications", "It is the OBR segment, and it describes the order for the test"]),
 "S06-Q4": dict(a="Receive, validate, transform or map, route and monitor messages",
    w=["Decide whether the patient's insurance covers the test that was ordered", "Produce the lab result from the sample when the analyzer is busy", "Replace the EHR as the legal medical record for the patient"]),
 "S06-Q5": dict(a="Check patient matching and the unmatched-results queue; AA only means the message was accepted",
    w=["Do nothing, because AA proves the result reached the correct chart and clinician", "Ask the lab to resend the result, because AA means the message was lost in transit", "Conclude that HL7 failed and plan to replace the whole interface with FHIR"]),
 "S06-Q6": dict(a="v2 gives structure; shared meaning also needs agreed codes and units, such as LOINC",
    w=["Valid HL7 v2 messages cannot carry test codes, so meaning must be agreed by phone", "Meaning is guaranteed by the pipe and caret delimiters that structure each segment", "Only CDA documents can identify a lab test, so v2 messages are always ambiguous"]),
 "S07-Q1": dict(a="So any system can recognise, count and compare them as one test",
    w=["So the measured result values become more accurate and less variable", "So the labs no longer need to report units with each result", "So the claim for the test is automatically approved and paid"]),
 "S07-Q3": dict(a="HCPCS Level II", w=["CPT procedure codes", "ICD-10-PCS procedure codes", "RxNorm drug names"]),
 "S07-Q4": dict(a="Mappings need expert review; some are one-to-many or many-to-one and can lose detail",
    w=["If two names look alike, the codes are equivalent and no review is needed", "Every local code maps to exactly one standard code, with no loss of detail", "Once a mapping is built it stays correct and never needs to be revisited"]),
 "S07-Q5": dict(w=["It is assumed to be a percentage by every system and counted correctly", "It is converted to the correct unit by the MSH header segment", "It has no effect, because the LOINC test code is enough on its own"]),
 "S07-Q6": dict(a="Ask the clinician to clarify; do not guess a code from insufficient documentation",
    w=["Choose the most common diabetes code, because Maria is known to have diabetes", "Reuse the diagnosis code from her last visit so that the claim matches her history", "Leave the diagnosis off the claim and submit it anyway, since the note is brief"]),
 "S08-Q1": dict(w=["It belongs to the claim lifecycle only, because it is collected for this claim", "It is outside the revenue cycle, because no claim has been created yet", "It is handled by the clearinghouse before the claim goes to the payer"]),
 "S08-Q2": dict(a="That can be done; a clearinghouse is common but not required in every arrangement",
    w=["That is not possible; every claim must pass through a clearinghouse first", "That is allowed only for Medicare claims; commercial claims need a clearinghouse", "That is allowed, but the claim then skips adjudication and is paid automatically"]),
 "S08-Q3": dict(a="Partly paid; read the stated reason, then fix, add information or appeal; do not bill Maria automatically",
    w=["Rejected; correct the format and resubmit the claim, then bill Maria for the denied service now", "Pending; the payer has not reached a decision, so wait and take no action on either service", "Paid in full; post the payment and close the account because no patient balance remains"]),
 "S08-Q4": dict(q="Maria's covered in-network claim has a billed charge of $900 and an allowed amount of $600. No copay applies, and Maria has not reached her out-of-pocket maximum. She has $100 of her deductible left, then pays 20% coinsurance. How much does the payer pay?"),
 "S08-Q5": dict(a="EOB goes to the patient to explain processing; remittance advice goes to the provider to post payments",
    w=["Both go to the patient, and both are bills that must be paid when they arrive", "The remittance advice goes to the patient and the EOB goes to the provider for posting", "Both go to the clearinghouse, which then bills Maria for the balance on the provider's behalf"]),
 "S09-Q3": dict(a="Maria is counted as not above the threshold; the 20% describes the group",
    w=["Maria has a 20% chance of being above the threshold at her next test", "Maria's own result is 20% higher than the training threshold", "The report shows that Maria's care is better than the clinic average"]),
 "S09-Q4": dict(a="Two-sided models can share savings and may owe shared losses; rules vary by programme and track",
    w=["Downside risk means the ACO is paid a fixed amount per patient and can never share in savings", "An upside-only ACO must repay Medicare whenever its spending runs above the benchmark", "All ACOs operate under identical rules, the same benchmark and the same level of financial risk"]),
 "S09-Q5": dict(a="Ordinary billing claims generally lack the exact numeric HbA1c result; linked lab or EHR data is needed",
    w=["Claims arrive too slowly to be useful, although they always contain the exact result value", "Claims cannot show diagnoses, so the report could not identify patients with diabetes at all", "Claims record only each patient's most recent visit, so earlier results would be missing"],
    e="Ordinary billing claims generally do not carry the exact numeric lab result. Some quality-reporting codes can encode limited clinical information, but the result value usually comes from linked lab or EHR data."),
 "S09-Q6": dict(a="Check definitions, period, patient mix, patient numbers and data completeness for both clinics",
    w=["Accept it as proof, because a lower rate always means the clinic provides better care", "Accept it, because risk adjustment removes every difference between the two clinics", "Reject it outright, because rates from different clinics can never be compared"]),
 "S10-Q2": dict(a="Ask what it is for, who tested it, on which patients, and whether FDA authorized this use",
    w=["Accept the claim, because all healthcare AI tools are reviewed and approved by FDA", "Accept the claim, because any AI tool used in a hospital has been clinically validated", "Dismiss the claim, because FDA never reviews any software or AI-enabled devices"]),
 "S10-Q3": dict(w=["Generative AI inventing a reference that does not exist", "Bias from missing data about some patient groups", "A rule-based tool following its rules too literally"]),
 "S10-Q4": dict(a="It remains PHI even when approved; use it only in tools and workflows approved for that data",
    w=["Once a use is approved, the information stops being PHI and can go in any tool", "Removing the patient's name is enough to make any clinical note safe to paste into a tool", "Information is PHI only while it is stored on paper or in the original EHR"]),
 "S10-Q5": dict(a="Review is not automatically safe; reviewers need time, source access, knowledge and authority",
    w=["The review makes the use safe, because a trained person checked every draft note", "The review is unnecessary, because approved tools produce notes that are always correct", "The review proves the AI tool itself has been clinically validated for this use"]),
 "S10-Q6": dict(t="scenario", o=5, sl=21,
    q="Lab results sometimes fail to reach the EHR because the interface between the LIS and the EHR stops processing messages and nobody is alerted. Which example career path mainly involves building, monitoring and troubleshooting links like this?",
    a="Integration engineer, who builds and monitors the links between systems",
    w=["Revenue cycle analyst, who studies claims, denials and payments", "Healthcare data analyst, who builds reports and measures from the data", "Privacy and compliance specialist, who reviews data use, vendors and AI risk"],
    e="Integration engineers build and monitor the connections between systems (Session 6), using messaging standards and troubleshooting. These are example paths; role names vary and they are not Health Catalyst roles."),
}
_ids = {x["id"] for x in Q}
assert set(OV) <= _ids, set(OV) - _ids
for _x in Q:
    for k, v in OV.get(_x["id"], {}).items(): _x[k] = v


# length-balance pass: lengthen one plausible distractor so the keyed option is not the longest
_BAL = {
 ("S01-Q4",1):"Hospitals are paid by patients only, so billing data describes personal spending rather than the care delivered or its quality",
 ("S01-Q6",1):"Only the patient-facing apps and websites used to book, confirm and reschedule appointments online",
 ("S02-Q3",1):"The clearinghouse pays the provider first, then collects the unpaid balance from the payer and from Maria, after adding a handling fee",
 ("S02-Q5",0):"It is a regulator, because it sets and enforces the rules that hospitals must follow when they use data",
 ("S02-Q6",0):"Nothing; clearinghouses review each claim and make the final payment decision on the payer's behalf",
 ("S05-Q2",1):"Neither has HIPAA duties, because the data already sits in the clinic's EHR and is only being shared for payment purposes",
 ("S05-Q3",1):"Within 24 hours of discovery in every case, whatever the size, type, cause or number of people affected",
 ("S05-Q6",0):"Share it as de-identified, because names are the only identifiers that matter for privacy under HIPAA rules",
 ("S06-Q5",1):"Ask the lab to resend the result, because AA means the message was lost somewhere in transit between systems",
 ("S07-Q4",1):"Every local code maps to exactly one standard code, so a mapping never loses any detail or meaning",
 ("S08-Q3",0):"Rejected; correct the format and resubmit the claim, then bill Maria for the denied service straight away to recover it",
 ("S08-Q5",2):"Both go to the clearinghouse, which then bills Maria for the balance on the provider's behalf after reviewing it",
 ("S09-Q5",0):"Claims arrive too slowly to be useful for a yearly measure, although they always contain the exact result value",
 ("S09-Q6",0):"Accept it as proof, because a lower rate always means the clinic provides better care to its patients",
 ("S10-Q4",1):"Removing the patient's name is enough to make any clinical note safe to paste into an approved or unapproved tool",
 ("S10-Q5",1):"The review is unnecessary, because approved tools produce draft notes that are always accurate and complete",
 ("S06-Q1",0):"It is interoperable, because delivery of the result to the other system is all the definition requires",
 ("S02-Q2",1):"Her spouse is the patient, because the policyholder is always the person who receives the care",
 ("S04-Q5",0):"In the portal, because that is where Maria opens and reads the result for the first time after her visit",
}
for _x in Q:
    for (i, k), v in _BAL.items():
        if _x["id"] == i: _x["w"][k] = v


# round-2 review: ambiguity and distractor plausibility (distractors are common misunderstandings, not absurdities)
_R2 = {
 "S01-Q2": dict(w=["Emergency care", "Tertiary care", "Secondary care"]),
 "S01-Q3": dict(a="Palliative care is for anyone with a serious illness, not only at the end of life; hospice is for terminal illness",
    w=["Palliative care is only for the final days of life, while hospice can begin at any time after diagnosis", "Palliative care replaces all other treatment, while hospice is given alongside curative treatment", "Palliative care is provided only in hospitals, while hospice is provided only at home"]),
 "S01-Q4": dict(w=["Because the US has a single national insurer, coverage data is identical for every patient everywhere", "Hospitals and clinicians set all prices alone, so insurance data adds little to decisions", "Coverage decides who pays but not whether people can get care, so it matters little to access"]),
 "S01-Q5": dict(w=["Data volume; moving every record to cheaper storage would solve the problem", "Rising costs; negotiating lower prices with each provider would solve the problem", "Access gaps; opening more clinic locations would solve the problem"]),
 "S02-Q3": dict(w=["The payer pays Maria her share, and Maria then pays the provider the full amount", "The payer pays the provider its share, and the provider then bills Maria for the full original charge instead of her share", "The clearinghouse pays the provider and later collects the full amount back from Maria"]),
 "S02-Q6": dict(w=["Nothing; clearinghouses approve or deny each claim on the payer's behalf after scrubbing it", "Clearinghouses set the allowed amount for each service on the claim before it is sent on", "Clearinghouses determine whether the patient is eligible for coverage"]),
 "S04-Q1": dict(w=["An electronic medical record (EMR) kept by one clinic", "An electronic health record (EHR) designed to be shared across organizations", "A patient portal account run by the hospital"]),
 "S05-Q2": dict(w=["Both are covered entities, so no written agreement is needed between the clinic and the company", "Only the billing company has HIPAA duties, because it performs the claims work", "Neither has HIPAA duties, because the data already sits in the clinic's EHR and is shared for payment"]),
 "S05-Q3": dict(w=["Within 30 days of discovery in every case, whatever the size of the breach", "Only when more than 500 people are affected; smaller breaches never need individual notice to anyone", "Within 90 days after the clinic finishes its own investigation, however long that takes"]),
 "S05-Q4": dict(w=["Nothing; minimum necessary applies to every disclosure, including those made for treatment", "Minimum necessary applies, but only when the patient has not signed an authorization", "Minimum necessary applies to treatment between organizations, but not inside one hospital"]),
 "S06-Q4": dict(w=["Decide whether the patient's insurance covers the test that was ordered", "Interpret abnormal results and notify the clinician who should act on them", "Store the permanent legal medical record for each patient"]),
 "S06-Q6": dict(w=["Nothing; a valid v2 message makes every receiving system map each field the same way", "Valid v2 requires every sender to use the same local test names, so meaning is fixed", "v2 is the problem; FHIR guarantees that every system will interpret a test identically"]),
 "S07-Q1": dict(w=["So the three labs use identical analyzers and methods", "So each system can keep its own local names without any mapping", "So the claim for the test is paid automatically"]),
 "S07-Q5": dict(w=["Every system will assume the usual percent unit, so reports stay correct", "The receiving EHR will always add the correct unit automatically", "The LOINC test code makes the unit unnecessary, so reports are unaffected"]),
 "S07-Q6": dict(o=2, sl=6),
 "S08-Q2": dict(w=["That is not possible; every claim must pass through a clearinghouse first", "That is allowed only for Medicare claims; commercial claims need a clearinghouse", "That is allowed, but the clinic must then submit paper claims only"]),
 "S08-Q4": dict(a="$400", w=["$480", "$500", "$700"]),
 "S09-Q5": dict(w=["Claims are too aggregated to show individual patients, so a patient-level report is impossible", "Claims never carry diagnosis codes, so patients with diabetes could not be identified", "Claims include only the patient's most recent visit, so earlier results would be missing"]),
 "S10-Q2": dict(w=["Accept the claim, because FDA authorization covers every setting and patient group", "Accept the claim, because FDA authorization means the tool has no bias", "Reject the claim, because FDA only authorizes drugs and never software"]),
 "S10-Q3": dict(w=["Confabulation: the model invents details that were not in its input", "A rule-based tool following its rules too literally", "A security flaw that exposes the training data"]),
}
for _x in Q:
    for k, v in _R2.get(_x["id"], {}).items(): _x[k] = v
# structural safety checks: one keyed answer, no duplicate or near-duplicate options
for _x in Q:
    _o = [_x["a"]] + _x["w"]
    assert len({o.lower() for o in _o}) == 4, _x["id"]

# ===================================================================== validation
def load_deck(n):
    t = open(os.path.join(SRC, f"session{n:02d}.txt")).read()
    out = {}
    for p in t.split("\n--- ")[1:]:
        m = re.match(r"S\d+ slide (\d+) \[(.*?)\]", p)
        out[int(m.group(1))] = (m.group(2), p)
    return out

def objectives(n):
    t = open(os.path.join(SRC, f"session{n:02d}.txt")).read()
    p = t.split("\n--- ")[2].split("\nNOTES:")[0]
    return re.findall(r"\n\d\n(.+)", p)

decks = {n: load_deck(n) for n in range(1, 11)}
objs = {n: objectives(n) for n in range(1, 11)}
assert all(len(v) == 5 for v in objs.values())

# arithmetic checks
assert 40 == 40 and 250 - 40 == 210
assert 500 + round(0.2 * (2000 - 500)) == 800 and round(0.2 * 2000) == 400
assert (100 + round(0.2 * (600 - 100)), 600 - (100 + round(0.2 * (600 - 100))), 900 - 600) == (200, 400, 300)
assert round(0.8 * 600) == 480
den = 120 - 6
assert den == 114 and round(100 * 19 / den, 1) == 16.7 and round(100 * 19 / 120, 1) == 15.8 and round(100 * 19 / (den - 12), 1) == 18.6 and round(100 * 12 / den, 1) == 10.5

bank = []
per_session = Counter(q["s"] for q in Q)
assert all(per_session[s] == 6 for s in range(1, 11)), per_session
assert len(Q) == 60
seen_q = set()
longest_correct = 0
counters = defaultdict(int)
for q in Q:
    counters[q["s"]] += 1
    qid = f"S{q['s']:02d}-Q{counters[q['s']]}"
    assert len(q["w"]) == 3 and len(set([q["a"]] + q["w"])) == 4, qid
    assert q["q"] not in seen_q
    seen_q.add(q["q"])
    assert 1 <= q["o"] <= 5
    title, _ = decks[q["s"]][q["sl"]]
    if max(len(x) for x in q["w"] + [q["a"]]) == len(q["a"]) and len(q["a"]) > max(len(x) for x in q["w"]) + 15:
        longest_correct += 1
    bank.append(dict(
        id=qid, session=q["s"], objectiveNumber=q["o"], objective=objs[q["s"]][q["o"] - 1], type=q["t"],
        text=q["q"], options=[q["a"]] + q["w"], correctIndex=0, explanation=q["e"],
        source=f"Session {q['s']}, slide {q['sl']}: {title or '(untitled)'}", sourceSlide=q["sl"],
    ))
# objective coverage: every session covers at least 4 of 5 objectives, no objective more than twice
for s in range(1, 11):
    c = Counter(b["objectiveNumber"] for b in bank if b["session"] == s)
    assert max(c.values()) <= 2, (s, c)
    assert len(c) >= 4, (s, c)
strict = sum(1 for b in bank if len(b["options"][0]) > max(len(o) for o in b["options"][1:]))
ratio = max(len(b["options"][0]) / max(len(o) for o in b["options"][1:]) for b in bank)
print("bank ok:", len(bank), "questions; correct strictly longest in", strict, "; max correct/longest-wrong ratio", round(ratio, 2))
assert strict <= 18 and ratio <= 1.3, "option-length bias"
os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
json.dump(bank, open(os.path.join(HERE, "data", "questions.json"), "w"), indent=1, ensure_ascii=False)
for s in range(1, 11):
    c = Counter(b["objectiveNumber"] for b in bank if b["session"] == s)
    print(s, dict(sorted(c.items())))
