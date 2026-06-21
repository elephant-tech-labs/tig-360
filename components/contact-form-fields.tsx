type ContactFormFieldsProps = {
  compact?: boolean;
  initialValues?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    secondaryEmail?: string;
    mobilePhone?: string;
    homePhone?: string;
    companyName?: string;
    jobTitle?: string;
    category?: string;
    streetLine1?: string;
    streetLine2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    county?: string;
    notes?: string;
  };
};

export function ContactFormFields({
  compact = false,
  initialValues = {},
}: ContactFormFieldsProps) {
  return (
    <>
      <fieldset>
        <legend>Contact</legend>
        <div className={`field-grid ${compact ? "contact-field-grid" : ""}`}>
          <label>
            First name
            <input name="firstName" autoComplete="given-name" defaultValue={initialValues.firstName} required />
          </label>
          <label>
            Last name
            <input name="lastName" autoComplete="family-name" defaultValue={initialValues.lastName} required />
          </label>
          <label>
            Contact category
            <select name="category" defaultValue={initialValues.category ?? "other"}>
              <option value="agent">Agent</option>
              <option value="homeowner">Homeowner</option>
              <option value="property_manager">Property manager</option>
              <option value="escrow">Escrow</option>
              <option value="contractor">Contractor</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Company
            <input name="companyName" autoComplete="organization" defaultValue={initialValues.companyName} />
          </label>
          <label>
            Job title
            <input name="jobTitle" autoComplete="organization-title" defaultValue={initialValues.jobTitle} />
          </label>
          <label>
            Primary email
            <input name="email" type="email" autoComplete="email" defaultValue={initialValues.email} />
          </label>
          <label>
            Secondary email
            <input name="secondaryEmail" type="email" defaultValue={initialValues.secondaryEmail} />
          </label>
          <label>
            Mobile phone
            <input name="mobilePhone" type="tel" autoComplete="tel" defaultValue={initialValues.mobilePhone} />
          </label>
          <label>
            Home phone
            <input name="homePhone" type="tel" defaultValue={initialValues.homePhone} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Address</legend>
        <div className={`field-grid ${compact ? "contact-field-grid" : ""}`}>
          <label className="field-span-2">
            Street address
            <input name="streetLine1" autoComplete="address-line1" defaultValue={initialValues.streetLine1} />
          </label>
          <label className="field-span-2">
            Unit or secondary address
            <input name="streetLine2" autoComplete="address-line2" defaultValue={initialValues.streetLine2} />
          </label>
          <label>
            City
            <input name="city" autoComplete="address-level2" defaultValue={initialValues.city} />
          </label>
          <label>
            County
            <input name="county" defaultValue={initialValues.county} />
          </label>
          <label>
            State
            <input name="region" autoComplete="address-level1" maxLength={2} defaultValue={initialValues.region ?? "CA"} />
          </label>
          <label>
            ZIP code
            <input name="postalCode" autoComplete="postal-code" defaultValue={initialValues.postalCode} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Notes</legend>
        <label>
          Internal contact notes
          <textarea name="notes" rows={compact ? 2 : 4} defaultValue={initialValues.notes} />
        </label>
      </fieldset>
    </>
  );
}
