import Image from "next/image";
import { redirect } from "next/navigation";
import { Ban, Check, KeyRound, Plus, RotateCw, ShieldCheck, Upload, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ManagementNav } from "@/components/management-nav";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { canAccessManagement, roleLabels, type MembershipRole } from "@/lib/access";
import { getCurrentContext } from "@/lib/current-organization";
import {
  createInspector,
  inviteTeamMember,
  resendTeamInvitation,
  removeInspectorSignature,
  revokeTeamInvitation,
  updateTeamMemberAccess,
  updateInspector,
} from "./actions";

type InspectorsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function InspectorsPage({ searchParams }: InspectorsPageProps) {
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  if (!canAccessManagement(membership.role)) redirect("/jobs");
  const [
    { data: inspectors, error },
    { data: invitations, error: invitationError },
    { data: memberships, error: membershipError },
  ] =
    await Promise.all([
      supabase
        .from("inspectors")
        .select(`
          id, linked_user_id, full_name, email, phone, license_number,
          license_expires_on, signature_path, signature_filename, is_active,
          profiles(full_name, email)
        `)
        .eq("organization_id", organization.id)
        .order("full_name"),
      supabase
        .from("organization_invitations")
        .select("id, email, role, status, created_at, expires_at, last_sent_at, send_count, inspector_id")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("organization_memberships")
        .select("user_id, role, status, created_at, profiles(full_name, email)")
        .eq("organization_id", organization.id),
    ]);

  if (error) throw new Error(error.message);
  if (invitationError) throw new Error(invitationError.message);
  if (membershipError) throw new Error(membershipError.message);
  const canManage = membership.role === "administrator" || membership.role === "manager";
  const isAdmin = membership.role === "administrator";
  const signatureUrls = new Map<string, string>();

  for (const inspector of inspectors ?? []) {
    if (!inspector.signature_path) continue;
    const { data } = await supabase.storage
      .from("inspector-signatures")
      .createSignedUrl(inspector.signature_path, 60 * 10);
    if (data?.signedUrl) signatureUrls.set(inspector.id, data.signedUrl);
  }

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role} active="management">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Organization management</p>
          <h1>Company and report settings</h1>
          <p>Manage the legal identity, report content, inspectors, and access used across every inspection.</p>
        </div>
      </div>
      <ManagementNav current="inspectors" />

      <div className="team-page">
        {messages.saved ? <div className="form-alert success"><Check size={17} /> {messages.saved}</div> : null}
        {messages.error ? <div className="form-alert error">{messages.error}</div> : null}

        {canManage ? (
          <section className="team-create-band">
            <form className="inspector-create-form" action={createInspector}>
              <input name="organizationId" type="hidden" value={organization.id} />
              <div className="section-heading compact">
                <div><h2>Add inspector</h2><span className="section-subtitle">No login account is required</span></div>
              </div>
              <label>Full name<input name="fullName" required /></label>
              <label>Email<input name="email" type="email" /></label>
              <label>Phone<input name="phone" type="tel" /></label>
              <label>License number<input name="licenseNumber" /></label>
              <label>License expiration<input name="licenseExpiresOn" type="date" /></label>
              {isAdmin ? (
                <label className="inline-check"><input name="allowLogin" type="checkbox" /> Send login invitation now</label>
              ) : null}
              <PendingSubmitButton className="primary-button" pendingLabel="Adding inspector">
                <Plus size={16} /> Add inspector
              </PendingSubmitButton>
            </form>

            {isAdmin ? (
              <form className="team-invite-form" action={inviteTeamMember}>
                <input name="organizationId" type="hidden" value={organization.id} />
                <div className="section-heading compact">
                  <div><h2>Invite office user</h2><span className="section-subtitle">Grant login access without an inspector profile</span></div>
                </div>
                <label>Email<input name="inviteEmail" type="email" required /></label>
                <label>
                  Role
                  <select name="inviteRole" defaultValue="office_coordinator">
                    <option value="office_coordinator">Office coordinator</option>
                    <option value="manager">Manager</option>
                    <option value="treatment_coordinator">Treatment coordinator</option>
                    <option value="administrator">Administrator</option>
                  </select>
                </label>
                <PendingSubmitButton className="secondary-button" pendingLabel="Sending invitation">
                  <UserPlus size={16} /> Send invitation
                </PendingSubmitButton>
              </form>
            ) : null}
          </section>
        ) : null}

        <div className="inspector-profile-list">
          {(inspectors ?? []).map((inspector) => {
            const linkedProfile = Array.isArray(inspector.profiles)
              ? inspector.profiles[0]
              : inspector.profiles;
            const linkedMembership = (memberships ?? []).find(
              (item) => item.user_id === inspector.linked_user_id,
            );
            const signatureUrl = signatureUrls.get(inspector.id);
            const pendingInvitation = (invitations ?? []).find(
              (invitation) => invitation.inspector_id === inspector.id && invitation.status === "pending",
            );

            return (
              <article className="inspector-profile-row" key={inspector.id}>
                <div className="inspector-identity">
                  <div className="onboarding-icon"><ShieldCheck size={21} /></div>
                  <div>
                    <strong>{inspector.full_name}</strong>
                    <span>{inspector.email || "No email"} · {inspector.is_active ? "active" : "inactive"}</span>
                    <span className="login-state">
                      <KeyRound size={12} />
                      {linkedProfile
                        ? `${linkedMembership?.status || "linked"} login`
                        : pendingInvitation
                          ? "invitation pending"
                          : "profile only"}
                    </span>
                  </div>
                </div>

                <form className="inspector-profile-form" action={updateInspector}>
                  <input name="organizationId" type="hidden" value={organization.id} />
                  <input name="inspectorId" type="hidden" value={inspector.id} />
                  <label>Full name<input name="fullName" defaultValue={inspector.full_name} disabled={!canManage} required /></label>
                  <label>Email<input name="email" type="email" defaultValue={inspector.email ?? ""} disabled={!canManage} /></label>
                  <label>Phone<input name="phone" type="tel" defaultValue={inspector.phone ?? ""} disabled={!canManage} /></label>
                  <label>License number<input name="licenseNumber" defaultValue={inspector.license_number ?? ""} disabled={!canManage} /></label>
                  <label>License expiration<input name="licenseExpiresOn" type="date" defaultValue={inspector.license_expires_on ?? ""} disabled={!canManage} /></label>
                  <label className="signature-upload">Signature image<input name="signature" type="file" accept="image/png,image/jpeg,image/webp" disabled={!canManage} /></label>
                  <label className="inline-check"><input name="isActive" type="checkbox" defaultChecked={inspector.is_active} disabled={!canManage} /> Available for inspections</label>
                  {canManage ? <PendingSubmitButton className="primary-button" pendingLabel="Saving inspector"><Upload size={16} /> Save profile</PendingSubmitButton> : null}
                </form>

                <div className="signature-preview">
                  {signatureUrl ? (
                    <>
                      <Image src={signatureUrl} alt={`Signature for ${inspector.full_name}`} width={220} height={90} unoptimized />
                      <span>{inspector.signature_filename}</span>
                      {canManage ? (
                        <form action={removeInspectorSignature}>
                          <input name="organizationId" type="hidden" value={organization.id} />
                          <input name="inspectorId" type="hidden" value={inspector.id} />
                          <button className="danger-text-button" type="submit">Remove signature</button>
                        </form>
                      ) : null}
                    </>
                  ) : <div className="signature-empty">No signature stored</div>}

                  {isAdmin && !linkedProfile && !pendingInvitation && inspector.email ? (
                    <form action={inviteTeamMember}>
                      <input name="organizationId" type="hidden" value={organization.id} />
                      <input name="inspectorId" type="hidden" value={inspector.id} />
                      <input name="inviteEmail" type="hidden" value={inspector.email} />
                      <input name="inviteRole" type="hidden" value="inspector" />
                      <PendingSubmitButton className="secondary-button" pendingLabel="Sending invite">
                        <KeyRound size={15} /> Allow login
                      </PendingSubmitButton>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {isAdmin && memberships?.length ? (
          <section className="team-access-list">
            <div className="section-heading compact">
              <div>
                <h2>Team access</h2>
                <span className="section-subtitle">Roles determine what each signed-in person can see and change</span>
              </div>
            </div>
            {(memberships ?? []).map((teamMember) => {
              const profile = Array.isArray(teamMember.profiles)
                ? teamMember.profiles[0]
                : teamMember.profiles;
              const isCurrentUser = teamMember.user_id === membership.user_id;

              return (
                <form className="team-access-row" action={updateTeamMemberAccess} key={teamMember.user_id}>
                  <input name="organizationId" type="hidden" value={organization.id} />
                  <input name="userId" type="hidden" value={teamMember.user_id} />
                  <div className="team-member-name">
                    <strong>{profile?.full_name || profile?.email || "Team member"}</strong>
                    <small>{profile?.email || "No email"}{isCurrentUser ? " · You" : ""}</small>
                  </div>
                  <label>
                    <span>Role</span>
                    <select name="role" defaultValue={teamMember.role} disabled={isCurrentUser}>
                      {(Object.keys(roleLabels) as MembershipRole[]).map((role) => (
                        <option value={role} key={role}>{roleLabels[role]}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Access</span>
                    <select name="status" defaultValue={teamMember.status} disabled={isCurrentUser}>
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </label>
                  {isCurrentUser ? (
                    <span className="current-access">Current administrator</span>
                  ) : (
                    <PendingSubmitButton className="secondary-button" pendingLabel="Updating access">
                      Save access
                    </PendingSubmitButton>
                  )}
                </form>
              );
            })}
          </section>
        ) : null}

        {isAdmin && invitations?.length ? (
          <section className="invitation-history">
            <div className="section-heading compact"><div><h2>Access invitations</h2><span className="section-subtitle">Recent organization invitations</span></div></div>
            {invitations.map((invitation) => (
              <div className="invitation-row" key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <small>
                    {invitation.last_sent_at
                      ? `Last sent ${new Date(invitation.last_sent_at).toLocaleString()}`
                      : `Created ${new Date(invitation.created_at).toLocaleString()}`}
                  </small>
                </div>
                <span>{invitation.role.replaceAll("_", " ")}</span>
                <span className={`invitation-status ${invitation.status}`}>{invitation.status}</span>
                <small>{invitation.send_count} email{invitation.send_count === 1 ? "" : "s"}</small>
                {["pending", "expired", "failed"].includes(invitation.status) ? (
                  <div className="invitation-actions">
                    <form action={resendTeamInvitation}>
                      <input name="organizationId" type="hidden" value={organization.id} />
                      <input name="inviteEmail" type="hidden" value={invitation.email} />
                      <input name="inviteRole" type="hidden" value={invitation.role} />
                      <input name="inspectorId" type="hidden" value={invitation.inspector_id ?? ""} />
                      <PendingSubmitButton className="secondary-button" pendingLabel="Resending">
                        <RotateCw size={14} /> Resend
                      </PendingSubmitButton>
                    </form>
                    <form action={revokeTeamInvitation}>
                      <input name="organizationId" type="hidden" value={organization.id} />
                      <input name="invitationId" type="hidden" value={invitation.id} />
                      <PendingSubmitButton className="danger-outline-button" pendingLabel="Revoking">
                        <Ban size={14} /> Revoke
                      </PendingSubmitButton>
                    </form>
                  </div>
                ) : <span />}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
