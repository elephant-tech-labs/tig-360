type ContactFormFieldsProps = {
  compact?: boolean;
};

export function ContactFormFields({ compact = false }: ContactFormFieldsProps) {
  return (
    <div className={`field-grid ${compact ? "contact-field-grid" : ""}`}>
      <label>
        First name
        <input name="firstName" autoComplete="given-name" required />
      </label>
      <label>
        Last name
        <input name="lastName" autoComplete="family-name" required />
      </label>
      <label>
        Primary email
        <input name="email" type="email" autoComplete="email" />
      </label>
      <label>
        Secondary email
        <input name="secondaryEmail" type="email" />
      </label>
      <label>
        Mobile phone
        <input name="mobilePhone" type="tel" autoComplete="tel" />
      </label>
      <label>
        Home phone
        <input name="homePhone" type="tel" />
      </label>
      <label>
        Company
        <input name="companyName" autoComplete="organization" />
      </label>
      <label>
        Job title
        <input name="jobTitle" autoComplete="organization-title" />
      </label>
      <label className="field-span-2">
        Notes
        <textarea name="notes" rows={compact ? 2 : 4} />
      </label>
    </div>
  );
}
