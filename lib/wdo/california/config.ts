export const CALIFORNIA_WDO_SERIALIZER_VERSION = "ca-wdo-termitekiosk-206-v1";
export const CALIFORNIA_WDO_RECORD_LENGTH = 206;
export const CALIFORNIA_WDO_LINE_ENDING = "\r\n";
export const CALIFORNIA_WDO_FILING_BUSINESS_DAYS = 10;
export const CALIFORNIA_WDO_FEE_PER_ACTIVITY = 5;

export const CALIFORNIA_WDO_FIELD_WIDTHS = {
  companyName: 50,
  registrationNumber: 20,
  activityDate: 10,
  buildingNumber: 6,
  street: 50,
  city: 50,
  zipCode: 9,
  inspectorLicenseNumber: 10,
  activityCode: 1,
} as const;

export const CALIFORNIA_WDO_BRANCH_SERIALIZATION_VERIFIED = false;
