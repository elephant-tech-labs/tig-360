import type { JSONContent } from "@tiptap/react";

export type ProposalParty = {
  role: string;
  name: string;
  company: string | null;
  email: string | null;
};

export type ProposalLineSnapshot = {
  id: string;
  code: string | null;
  section: string | null;
  title: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type ProposalContentBlock = {
  id: string;
  title: string;
  body: string;
  bodyJson: JSONContent | null;
  sortOrder: number;
};

export type ProposalSnapshot = {
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
  };
  job: {
    id: string;
    number: number;
    reportType: string;
    inspectionAt: string | null;
  };
  property: {
    streetLine1: string;
    streetLine2: string | null;
    city: string;
    region: string;
    postalCode: string;
  };
  proposal: {
    id: string;
    title: string;
    status: string;
    customerNote: string | null;
    customerSummary: string | null;
    terms: string | null;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
  };
  parties: ProposalParty[];
  lines: ProposalLineSnapshot[];
  contractContent: ProposalContentBlock[];
};
