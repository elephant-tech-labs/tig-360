export type ReportParty = {
  contactId: string | null;
  name: string;
  company: string | null;
  email: string | null;
  role: string;
  roleLabel: string;
  isPrimary: boolean;
  sendByDefault: boolean;
};

export type ReportRecommendation = {
  id: string;
  description: string;
  estimatedCost: number | null;
};

export type ReportFinding = {
  id: string;
  entryType: "finding" | "note";
  reference: string;
  title: string;
  description: string;
  classification: string | null;
  notePlacement: "before" | "after" | null;
  recommendations: ReportRecommendation[];
};

export type ReportPhoto = {
  id: string;
  path: string;
  bucket: "inspection-photos";
  filename: string;
  caption: string;
  location: string;
  isCover: boolean;
  findingIds: string[];
};

export type ReportDiagram = {
  id: string;
  version: number;
  path: string | null;
  bucket: "diagram-renders";
};

export type InspectionReportSnapshot = {
  schemaVersion: 1;
  capturedAt: string;
  organization: {
    id: string;
    name: string;
    legalName: string;
    streetLine1: string | null;
    streetLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    registrationNumber: string | null;
    operatorLicense: string | null;
    contractorLicense: string | null;
    regulatoryContact: string | null;
    logoPath: string | null;
  };
  job: {
    id: string;
    number: number;
    reportType: string;
    inspectionAt: string | null;
    escrowNumber: string | null;
    generalDescription: string | null;
    priorJobNumber: number | null;
    inspectionTagPosted: string | null;
    otherTagsPosted: string | null;
    garageDescription: string | null;
  };
  property: {
    streetLine1: string;
    streetLine2: string | null;
    city: string;
    region: string;
    postalCode: string;
    county: string | null;
    propertyType: string | null;
  };
  inspector: {
    name: string;
    email: string | null;
    phone: string | null;
    licenseNumber: string | null;
    includeSignature: boolean;
    signaturePath: string | null;
    signatureBucket: "inspector-signatures";
  } | null;
  findingSummary: {
    subterraneanTermites: boolean;
    drywoodTermites: boolean;
    fungusDryrot: boolean;
    otherFindings: boolean;
    furtherInspection: boolean;
  };
  parties: ReportParty[];
  findings: ReportFinding[];
  photos: ReportPhoto[];
  diagram: ReportDiagram | null;
  legalContent: {
    id: string;
    title: string;
    body: string;
    placement: "before_findings" | "after_findings" | "contract";
    sortOrder: number;
    version: number;
    required: boolean;
  }[];
};

export type ReportMedia = {
  coverUrl: string | null;
  diagramUrl: string | null;
  signatureUrl: string | null;
  companyLogoUrl: string | null;
  photoUrls: Record<string, string>;
};

export type ReadinessIssue = {
  key: string;
  label: string;
  detail: string;
  severity: "blocking" | "advisory";
  href: string;
};

export type InspectionReportBundle = {
  snapshot: InspectionReportSnapshot;
  media: ReportMedia;
  readiness: {
    canGenerate: boolean;
    issues: ReadinessIssue[];
  };
};

export type ReportVersionSummary = {
  id: string;
  version: number;
  status: string;
  approvalStatus: string;
  approvedAt: string | null;
  generatedAt: string | null;
  createdAt: string;
  failureMessage: string | null;
  assetPath: string | null;
  filename: string | null;
};
