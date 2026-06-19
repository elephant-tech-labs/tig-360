import {
  Bell,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Grid2X2,
  Home,
  Image as ImageIcon,
  Mail,
  MapPin,
  MoreHorizontal,
  PenTool,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";

const stages = [
  { label: "Front page", status: "complete" },
  { label: "Diagram", status: "complete" },
  { label: "Findings", status: "active" },
  { label: "Photos", status: "complete" },
  { label: "Report", status: "ready" },
  { label: "Contract", status: "pending" },
];

const findings = [
  {
    code: "1A",
    title: "Subterranean termite evidence",
    location: "Garage, north wall",
    section: "Section I",
    severity: "High",
    photos: 4,
  },
  {
    code: "2B",
    title: "Fungus damage at fascia",
    location: "Rear elevation",
    section: "Section I",
    severity: "Moderate",
    photos: 3,
  },
  {
    code: "4D",
    title: "Earth-to-wood contact",
    location: "East crawlspace entry",
    section: "Section II",
    severity: "Attention",
    photos: 2,
  },
];

const parties = [
  { role: "Ordered by", name: "Avery Realty Group", detail: "Morgan Lee" },
  { role: "Property owner", name: "Jordan Williams", detail: "Primary owner" },
  { role: "Report recipient", name: "Priya Shah", detail: "priya@example.com" },
];

export default function HomePage() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">TI</div>
          <div>
            <strong>Trident</strong>
            <span>Inspect360</span>
          </div>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <a className="nav-item" href="#">
            <Grid2X2 size={18} /> Dashboard
          </a>
          <a className="nav-item active" href="#">
            <ClipboardCheck size={18} /> Inspection jobs
          </a>
          <a className="nav-item" href="#">
            <CalendarDays size={18} /> Schedule
          </a>
          <a className="nav-item" href="#">
            <Users size={18} /> Contacts
          </a>
          <a className="nav-item" href="#">
            <Building2 size={18} /> Properties
          </a>
          <a className="nav-item" href="#">
            <FileCheck2 size={18} /> Documents
          </a>
        </nav>

        <div className="sidebar-footer">
          <div className="workspace-avatar">JC</div>
          <div>
            <strong>Jeffrey Clark</strong>
            <span>Inspector</span>
          </div>
          <ChevronDown size={16} />
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="search-box">
            <Search size={17} />
            <input aria-label="Search" placeholder="Search jobs, addresses, contacts" />
          </label>
          <div className="topbar-actions">
            <button className="icon-button" title="Notifications" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <button className="new-job-button">
              <Plus size={17} /> New job
            </button>
          </div>
        </header>

        <div className="job-header">
          <div className="job-heading">
            <div className="job-kicker">Inspection job / #10068</div>
            <div className="title-line">
              <h1>1847 Alder Street</h1>
              <span className="status-pill">In review</span>
            </div>
            <p><MapPin size={15} /> Edmonds, WA 98020</p>
          </div>
          <div className="job-actions">
            <button className="secondary-button"><MoreHorizontal size={18} /> More</button>
            <button className="secondary-button"><FileText size={18} /> Preview report</button>
            <button className="primary-button"><Send size={17} /> Send center</button>
          </div>
        </div>

        <div className="stage-strip" aria-label="Inspection progress">
          {stages.map((stage, index) => (
            <div className={`stage ${stage.status}`} key={stage.label}>
              <span className="stage-index">
                {stage.status === "complete" ? <Check size={14} /> : index + 1}
              </span>
              <span>{stage.label}</span>
            </div>
          ))}
        </div>

        <div className="content-grid">
          <div className="main-column">
            <section className="readiness-band">
              <div className="readiness-score">
                <ShieldCheck size={22} />
                <div><strong>Report is nearly ready</strong><span>9 of 10 checks passed</span></div>
              </div>
              <div className="readiness-issue">
                <CircleAlert size={18} />
                <span>Add a recommendation to finding 4D before final generation.</span>
                <button>Review</button>
              </div>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Inspection authoring</span>
                  <h2>Findings and recommendations</h2>
                </div>
                <button className="secondary-button"><Plus size={17} /> Add finding</button>
              </div>

              <div className="finding-table">
                <div className="table-head">
                  <span>Finding</span><span>Location</span><span>Class</span><span>Evidence</span><span></span>
                </div>
                {findings.map((finding) => (
                  <article className="finding-row" key={finding.code}>
                    <div className="finding-title">
                      <span className="finding-code">{finding.code}</span>
                      <div><strong>{finding.title}</strong><span>{finding.severity} priority</span></div>
                    </div>
                    <span>{finding.location}</span>
                    <span className={`classification ${finding.section === "Section I" ? "section-one" : "section-two"}`}>{finding.section}</span>
                    <span className="evidence-count"><Camera size={15} /> {finding.photos}</span>
                    <button className="icon-button small" title={`Open finding ${finding.code}`} aria-label={`Open finding ${finding.code}`}><MoreHorizontal size={17} /></button>
                  </article>
                ))}
              </div>
            </section>

            <section className="section-block evidence-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Evidence</span>
                  <h2>Photos and diagram</h2>
                </div>
                <button className="secondary-button"><ImageIcon size={17} /> Manage evidence</button>
              </div>
              <div className="evidence-summary">
                <div className="evidence-metric"><Camera size={20} /><strong>18</strong><span>Inspection photos</span></div>
                <div className="evidence-metric"><PenTool size={20} /><strong>1</strong><span>Editable diagram</span></div>
                <div className="evidence-metric"><Check size={20} /><strong>9</strong><span>Linked to findings</span></div>
              </div>
            </section>
          </div>

          <aside className="details-column">
            <section className="detail-section">
              <div className="section-heading compact"><h2>Job details</h2><button className="text-button">Edit</button></div>
              <dl className="detail-list">
                <div><dt>Report type</dt><dd>Complete</dd></div>
                <div><dt>Inspection date</dt><dd>June 19, 2026</dd></div>
                <div><dt>Inspector</dt><dd>Jeffrey Clark</dd></div>
                <div><dt>Property</dt><dd>Single-family residence</dd></div>
              </dl>
            </section>

            <section className="detail-section">
              <div className="section-heading compact"><h2>Contacts on job</h2><button className="icon-button small" title="Add contact" aria-label="Add contact"><Plus size={16} /></button></div>
              <div className="party-list">
                {parties.map((party) => (
                  <div className="party" key={party.role}>
                    <div className="party-avatar">{party.name.slice(0, 1)}</div>
                    <div><span>{party.role}</span><strong>{party.name}</strong><small>{party.detail}</small></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section delivery-section">
              <div className="section-heading compact"><h2>Latest delivery</h2><Mail size={18} /></div>
              <div className="delivery-state"><Check size={17} /><strong>Report v3 delivered</strong></div>
              <p>Sent to Priya Shah on June 18 at 4:42 PM. CRM activity synchronized.</p>
              <button className="text-button">View delivery history</button>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
