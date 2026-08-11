export type CaliforniaWdoActivityCode = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type CaliforniaWdoActivityExportRecord = {
  companyName: string;
  registrationNumber: string;
  activityDate: string;
  buildingNumber: string;
  street: string;
  city: string;
  zipCode: string;
  inspectorLicenseNumber: string;
  activityCode: CaliforniaWdoActivityCode;
};

export type WdoValidationField =
  | "companyName"
  | "registrationNumber"
  | "activityDate"
  | "buildingNumber"
  | "street"
  | "city"
  | "zipCode"
  | "inspectorLicenseNumber"
  | "activityCode"
  | "branch";

export type WdoValidationIssue = {
  field: WdoValidationField;
  code: string;
  message: string;
  href?: string;
};

export type WdoAddressSource = {
  streetLine1: string | null;
  streetLine2: string | null;
  city: string | null;
  zipCode: string | null;
  overrideBuildingNumber?: string | null;
  overrideStreet?: string | null;
  overrideCity?: string | null;
  overrideZipCode?: string | null;
};

export type WdoActivityMappingInput = {
  activityId: string;
  activityDate: string | null;
  activityCode: number | null;
  branchId: string | null;
  branchName: string | null;
  companyName: string | null;
  registrationNumber: string | null;
  inspectorLicenseNumber: string | null;
  inspectorName: string | null;
  address: WdoAddressSource;
  links?: {
    activity?: string;
    property?: string;
    inspector?: string;
    companySettings?: string;
  };
};

export type WdoMappedActivity = {
  record: CaliforniaWdoActivityExportRecord;
  issues: WdoValidationIssue[];
};
