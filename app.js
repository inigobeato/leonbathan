const $ = (selector, root = document) => root.querySelector(selector);
const supabaseReady = Boolean(
  window.supabase?.createClient &&
  window.LEONBATHAN_SUPABASE_URL &&
  window.LEONBATHAN_SUPABASE_PUBLISHABLE_KEY
);
const db = supabaseReady
  ? window.supabase.createClient(window.LEONBATHAN_SUPABASE_URL, window.LEONBATHAN_SUPABASE_PUBLISHABLE_KEY)
  : null;

let projects = [];
let currentUser = null;
let resources = [];
let resourceFilter = "all";
let aboutProfile = null;

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}
function setMessage(selector, message, isError = false) {
  const node = $(selector);
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", isError);
}
function publicFileUrl(bucket, path) {
  if (!path) return "";
  return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
function normalizeProject(row) {
  return {
    id: row.id,
    title: row.title || "",
    description: row.description || "",
    type: row.type || "",
    version: row.version || "",
    image: row.image_url || "",
    liveUrl: row.live_url || "",
    downloadUrl: row.download_url || "",
    is_published: row.is_published !== false,
    image_path: row.image_path || "",
    app_path: row.app_path || ""
  };
}
function makeLink(url, label) {
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = label;
  return a;
}
function renderProjects() {
  const grid = $("#projectGrid");
  grid.replaceChildren();
  const publishedProjects = projects.filter(p => p.is_published);
  $("#emptyProjects").hidden = publishedProjects.length > 0;
  $("#emptyProjects").textContent = "No published projects yet. Check back soon.";
  publishedProjects.forEach(p => {
    const card = document.createElement("article");
    card.className = "project-card";
    const imageBox = document.createElement("div"); imageBox.className = "project-image";
    const imageUrl = safeUrl(p.image);
    if (imageUrl) {
      const img = document.createElement("img"); img.src = imageUrl; img.alt = `${p.title} screenshot`; img.loading = "lazy"; imageBox.append(img);
    } else {
      const placeholder = document.createElement("div"); placeholder.className = "project-placeholder"; placeholder.textContent = "✳"; imageBox.append(placeholder);
    }
    const content = document.createElement("div"); content.className = "project-content";
    const kicker = document.createElement("div"); kicker.className = "project-kicker"; kicker.textContent = `${p.type || "PROJECT"} / ${p.version || "AVAILABLE"}`;
    const title = document.createElement("h3"); title.textContent = p.title;
    const desc = document.createElement("p"); desc.textContent = p.description;
    const links = document.createElement("div"); links.className = "project-links";
    const live = safeUrl(p.liveUrl), download = safeUrl(p.downloadUrl);
    if (live) links.append(makeLink(live, "OPEN PROJECT ↗"));
    if (download) links.append(makeLink(download, "DOWNLOAD ↗"));
    if (!live && !download) { const soon = document.createElement("span"); soon.className = "project-kicker"; soon.textContent = "DETAILS COMING SOON"; links.append(soon); }
    content.append(kicker, title, desc, links); card.append(imageBox, content); grid.append(card);
  });
}
function renderAdminList() {
  const list = $("#adminProjectList");
  if (!list) return;
  list.replaceChildren();
  $("#projectCount").textContent = `${projects.length} ITEMS`;
  projects.forEach(p => {
    const row = document.createElement("div"); row.className = "admin-project-item";
    const info = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = p.title;
    const meta = document.createElement("small"); meta.textContent = `${p.type || "Project"} · ${p.version || "No version"} · ${p.is_published ? "Published" : "Draft"}`;
    info.append(name, meta);
    const actions = document.createElement("div"); actions.className = "admin-item-actions";
    const edit = document.createElement("button"); edit.className = "text-action"; edit.type = "button"; edit.textContent = "EDIT"; edit.addEventListener("click", () => editProject(p.id));
    const del = document.createElement("button"); del.className = "text-action delete"; del.type = "button"; del.textContent = "DELETE";
    del.addEventListener("click", async () => {
      if (!confirm(`Delete "${p.title}"?`)) return;
      const { data, error } = await db.from("projects").delete().eq("id", p.id).select("id").maybeSingle();
      if (error) return setMessage("#projectMessage", error.message, true);
      if (!data) return setMessage("#projectMessage", "Delete was not applied. The record may be blocked by database permissions or may no longer exist.", true);
      await loadProjects();
      setMessage("#projectMessage", "Project deleted.");
    });
    actions.append(edit, del); row.append(info, actions); list.append(row);
  });
}
async function loadProjects() {
  const viewerStatus = $("#viewerStatus");
  if (viewerStatus) viewerStatus.textContent = "Loading published applications…";

  if (!db) {
    const message = "The portfolio database is not configured. Please contact the site administrator.";
    $("#emptyProjects").hidden = false;
    $("#emptyProjects").textContent = message;
    if (viewerStatus) viewerStatus.textContent = "Database connection is not configured.";
    setMessage("#adminStatus", message, true);
    return false;
  }

  // Public visitors should request published rows only. Signed-in admins can
  // retrieve all rows so drafts remain manageable in the dashboard.
  let request = db.from("projects").select("*").order("created_at", { ascending: false });
  if (!currentUser) request = request.eq("is_published", true);

  const { data, error } = await request;
  if (error) {
    console.error("[Leonbathan] Unable to load projects:", error);
    projects = [];
    renderProjects();
    $("#emptyProjects").hidden = false;
    $("#emptyProjects").textContent = `We couldn't load the applications right now. Database error: ${error.message} (code: ${error.code || "unknown"}).`;
    if (viewerStatus) viewerStatus.textContent = `Unable to load applications: ${error.message}`;
    setMessage("#adminStatus", `Database read failed: ${error.message} (code: ${error.code || "unknown"}).`, true);
    if (currentUser) {
      $("#projectCount").textContent = "LOAD ERROR";
      $("#adminProjectList").replaceChildren();
    }
    return false;
  }

  projects = (data || []).map(normalizeProject);
  renderProjects();
  if (currentUser) renderAdminList();
  updateDashboardStats();

  const count = projects.filter(p => p.is_published).length;
  if (viewerStatus) {
    viewerStatus.textContent = count
      ? `${count} published application${count === 1 ? "" : "s"} · Updated just now`
      : "No published applications were returned by the database.";
  }
  return true;
}
async function checkAdmin(user) {
  if (!user) return false;
  const { data, error } = await db.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  return !error && Boolean(data);
}
function showAuthState(isAdmin) {
  $("#loginPanel").hidden = isAdmin;
  $("#dashboardPanel").hidden = !isAdmin;
  $("#logoutButton").hidden = !isAdmin;
  if (!isAdmin) setMessage("#loginMessage", currentUser ? "This account is not on the administrator allowlist." : "");
}
async function refreshSession() {
  if (!db) return;
  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user || null;
  const allowed = currentUser ? await checkAdmin(currentUser) : false;
  showAuthState(allowed);
  if (allowed) {
    setMessage("#adminStatus", `Signed in as ${currentUser.email}. Your changes sync to the public portfolio.`);
    await loadProjects();
    await loadResources();
  }
}
async function uploadFile(bucket, file, prefix) {
  if (!file || !file.size) return "";
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(-90);
  const path = `${prefix}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await db.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}
function editProject(id) {
  const p = projects.find(item => item.id === id);
  if (!p) return;
  const form = $("#projectForm");
  form.elements.id.value = p.id;
  form.elements.title.value = p.title;
  form.elements.description.value = p.description;
  form.elements.type.value = p.type;
  form.elements.version.value = p.version;
  form.elements.image_url.value = p.image;
  form.elements.download_url.value = p.downloadUrl;
  form.elements.live_url.value = p.liveUrl;
  form.elements.is_published.checked = p.is_published;
  form.dataset.imagePath = p.image_path || "";
  form.dataset.appPath = p.app_path || "";
  $("#formTitle").textContent = "Edit project";
  window.scrollTo({ top: $("#projectForm").getBoundingClientRect().top + window.scrollY - 100, behavior: "smooth" });
}
function clearForm() {
  const form = $("#projectForm");
  form.reset(); form.elements.id.value = ""; form.elements.image_url.value = ""; form.elements.download_url.value = "";
  delete form.dataset.imagePath; delete form.dataset.appPath;
  $("#formTitle").textContent = "Add an application / project";
  setMessage("#projectMessage", "");
}
async function handleProjectSave(event) {
  event.preventDefault();
  if (!currentUser) return;
  const form = event.currentTarget;
  const button = $("#saveProjectButton");
  button.disabled = true; button.textContent = "Saving...";
  try {
    const values = Object.fromEntries(new FormData(form).entries());
    if (values.live_url && !safeUrl(values.live_url)) throw new Error("Live URL must begin with https:// or http://.");
    if (values.external_download_url && !safeUrl(values.external_download_url)) throw new Error("Download URL must begin with https:// or http://.");
    let imagePath = form.dataset.imagePath || "";
    let appPath = form.dataset.appPath || "";
    if (form.elements.image_file.files[0]) imagePath = await uploadFile("project-assets", form.elements.image_file.files[0], "screenshots");
    if (form.elements.app_file.files[0]) appPath = await uploadFile("app-downloads", form.elements.app_file.files[0], "apps");
    const imageUrl = imagePath ? publicFileUrl("project-assets", imagePath) : (values.image_url || "");
    const externalDownload = safeUrl(values.external_download_url || "");
    const appUrl = appPath ? publicFileUrl("app-downloads", appPath) : (values.download_url || "");
    const payload = {
      title: values.title.trim(),
      description: values.description.trim(),
      type: values.type.trim(),
      version: values.version.trim(),
      image_url: imageUrl,
      image_path: imagePath || null,
      live_url: safeUrl(values.live_url || "") || null,
      download_url: externalDownload || appUrl || null,
      app_path: appPath || null,
      is_published: form.elements.is_published.checked
    };
    let result;
    if (values.id) {
      result = await db.from("projects").update(payload).eq("id", values.id).select("id").maybeSingle();
    } else {
      result = await db.from("projects").insert(payload).select("id").single();
    }
    if (result.error) throw result.error;
    if (!result.data) {
      throw new Error("No database row was changed. Check that this account is listed in admin_users and that the Supabase UPDATE policy allows this administrator.");
    }
    const loaded = await loadProjects();
    if (!loaded) throw new Error("The project was saved, but the latest project list could not be reloaded. Check the database read permissions.");
    clearForm();
    setMessage("#projectMessage", "Saved successfully. The database confirmed the change and the project list was refreshed.");
  } catch (error) {
    console.error(error);
    setMessage("#projectMessage", error.message || "Unable to save project.", true);
  } finally {
    button.disabled = false; button.textContent = "Save project";
  }
}


const DEFAULT_ABOUT = {
  eyebrow: "04 / A LITTLE ABOUT ME",
  heading1: "Curious mind.",
  heading2: "Practical mindset.",
  paragraph1: "I bring together an interest in technology and a foundation in accounting. I enjoy exploring how software can make everyday processes clearer, faster, and more organized.",
  paragraph2: "This portfolio is where I share my applications, experiments, and professional journey.",
  skills: ["HTML", "CSS", "JavaScript", "Problem solving", "Accounting fundamentals"]
};
function renderAbout(profile = DEFAULT_ABOUT) {
  aboutProfile = profile;
  $("#aboutEyebrow").textContent = profile.eyebrow || DEFAULT_ABOUT.eyebrow;
  const heading = $("#aboutHeading");
  heading.replaceChildren(document.createTextNode(profile.heading1 || DEFAULT_ABOUT.heading1), document.createElement("br"));
  const highlight = document.createElement("span");
  highlight.className = "gradient-text";
  highlight.textContent = profile.heading2 || DEFAULT_ABOUT.heading2;
  heading.append(highlight);
  $("#aboutParagraph1").textContent = profile.paragraph1 || "";
  $("#aboutParagraph2").textContent = profile.paragraph2 || "";
  const skills = Array.isArray(profile.skills) ? profile.skills : DEFAULT_ABOUT.skills;
  const skillList = $("#skillList");
  skillList.replaceChildren();
  skills.filter(Boolean).forEach(skill => {
    const span = document.createElement("span");
    span.textContent = skill;
    skillList.append(span);
  });
}
function populateAboutForm(profile = aboutProfile || DEFAULT_ABOUT) {
  const form = $("#aboutForm");
  if (!form) return;
  ["eyebrow","heading1","heading2","paragraph1","paragraph2"].forEach(key => form.elements[key].value = profile[key] || DEFAULT_ABOUT[key]);
  form.elements.skills.value = (profile.skills || DEFAULT_ABOUT.skills).join(", ");
}
async function loadAboutProfile() {
  if (!db) { renderAbout(); return false; }
  const { data, error } = await db.from("about_profile").select("*").eq("id", 1).maybeSingle();
  if (error) {
    console.error("[Leonbathan] Unable to load About profile:", error);
    renderAbout();
    if (currentUser) setMessage("#aboutMessage", `Unable to load About section: ${error.message}. Run the updated SQL migration.`, true);
    return false;
  }
  const profile = data ? {
    eyebrow: data.eyebrow, heading1: data.heading1, heading2: data.heading2,
    paragraph1: data.paragraph1, paragraph2: data.paragraph2,
    skills: Array.isArray(data.skills) ? data.skills : DEFAULT_ABOUT.skills
  } : DEFAULT_ABOUT;
  renderAbout(profile);
  if (currentUser) populateAboutForm(profile);
  return true;
}
async function handleAboutSave(event) {
  event.preventDefault();
  if (!currentUser) return;
  const form = event.currentTarget, button = $("#saveAboutButton");
  button.disabled = true; button.textContent = "Saving…";
  try {
    const skills = form.elements.skills.value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 20);
    const payload = {
      id: 1, eyebrow: form.elements.eyebrow.value.trim(),
      heading1: form.elements.heading1.value.trim(), heading2: form.elements.heading2.value.trim(),
      paragraph1: form.elements.paragraph1.value.trim(), paragraph2: form.elements.paragraph2.value.trim(),
      skills, updated_at: new Date().toISOString()
    };
    const { data, error } = await db.from("about_profile").upsert(payload, { onConflict: "id" }).select("*").single();
    if (error) throw error;
    renderAbout({ ...data, skills: Array.isArray(data.skills) ? data.skills : skills });
    populateAboutForm(aboutProfile);
    setMessage("#aboutMessage", "About section saved and published successfully.");
  } catch (error) {
    console.error(error);
    setMessage("#aboutMessage", `Unable to save About section: ${error.message}`, true);
  } finally {
    button.disabled = false; button.textContent = "Save About section";
  }
}

function applyTheme(theme) {
  const selected = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = selected;
  localStorage.setItem("leonbathan-theme", selected);
  document.querySelectorAll("[data-theme-toggle]").forEach(button => {
    button.textContent = selected === "dark" ? "☀ Light mode" : "☾ Dark mode";
    button.setAttribute("aria-label", selected === "dark" ? "Switch to light mode" : "Switch to dark mode");
  });
}
function updateDashboardStats() {
  const set = (id, value) => { const node = $(id); if (node) node.textContent = String(value); };
  set("#statProjects", projects.length);
  set("#statPdfs", resources.filter(r => r.category === "pdf").length);
  set("#statLogos", resources.filter(r => r.category === "logo").length);
  set("#statPublished", projects.filter(p => p.is_published).length + resources.filter(r => r.is_published).length);
}
function resourceUrl(path) {
  if (!path || !db) return "";
  return db.storage.from("portfolio-resources").getPublicUrl(path).data.publicUrl;
}
function renderPublicResources() {
  const grid = $("#publicResourceGrid"); if (!grid) return;
  grid.replaceChildren();
  const shown = resources.filter(r => r.is_published && (resourceFilter === "all" || r.category === resourceFilter));
  $("#emptyResources").hidden = shown.length > 0;
  shown.forEach(r => {
    const card = document.createElement("article"); card.className = "resource-card";
    const preview = document.createElement("div"); preview.className = "resource-preview";
    const url = resourceUrl(r.file_path);
    if (r.category === "logo") {
      const img = document.createElement("img"); img.src = url; img.alt = r.title; img.loading = "lazy"; preview.append(img);
    } else {
      const icon = document.createElement("div"); icon.className = "pdf-icon"; icon.textContent = "PDF"; preview.append(icon);
    }
    const body = document.createElement("div"); body.className = "resource-content";
    const tag = document.createElement("div"); tag.className = "project-kicker"; tag.textContent = r.category === "pdf" ? "REVIEWER / STUDY MATERIAL" : "LOGO DESIGN";
    const title = document.createElement("h3"); title.textContent = r.title;
    const desc = document.createElement("p"); desc.textContent = r.description || "";
    const meta = document.createElement("small"); meta.className = "resource-tags"; meta.textContent = r.tags || "";
    const links = document.createElement("div"); links.className = "project-links";
    if (r.category === "pdf") links.append(makeLink(url, "VIEW / DOWNLOAD PDF ↗"));
    else links.append(makeLink(url, "VIEW ORIGINAL IMAGE ↗"));
    body.append(tag, title, desc); if (r.tags) body.append(meta); body.append(links);
    card.append(preview, body); grid.append(card);
  });
}
async function loadResources() {
  if (!db) return false;
  const { data, error } = await db.from("resources").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("[Leonbathan] Unable to load resources:", error);
    setMessage("#resourceMessage", `Unable to load resources: ${error.message}`, true);
    return false;
  }
  resources = data || [];
  renderPublicResources();
  if (currentUser) renderAdminResources();
  updateDashboardStats();
  return true;
}
function clearResourceForm() {
  const form = $("#resourceForm"); if (!form) return;
  form.reset(); form.elements.id.value = "";
  delete form.dataset.filePath;
  $("#resourceFormTitle").textContent = "Add a PDF or logo design";
  $("#resourceFile").required = true;
  updateResourceFileControl();
  setMessage("#resourceMessage", "");
}
function updateResourceFileControl() {
  const category = $("#resourceCategory").value;
  const input = $("#resourceFile");
  if (category === "pdf") {
    input.accept = "application/pdf,.pdf";
    $("#resourceFileHint").textContent = "PDF only · Maximum 50 MB";
    $("#resourceFileLabel").firstChild.textContent = "Upload PDF file";
  } else {
    input.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
    $("#resourceFileHint").textContent = "PNG, JPG, WEBP, or SVG · Maximum 10 MB";
    $("#resourceFileLabel").firstChild.textContent = "Upload logo image";
  }
}
function editResource(id) {
  const r = resources.find(item => item.id === id); if (!r) return;
  const form = $("#resourceForm");
  form.elements.id.value = r.id; form.elements.category.value = r.category;
  form.elements.title.value = r.title; form.elements.description.value = r.description || "";
  form.elements.tags.value = r.tags || ""; form.elements.is_published.checked = r.is_published;
  form.dataset.filePath = r.file_path || "";
  $("#resourceFile").required = false;
  $("#resourceFormTitle").textContent = "Edit resource";
  updateResourceFileControl();
  document.querySelector('[data-admin-tab="resources"]').click();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}
function renderAdminResources() {
  const list = $("#adminResourceList"); if (!list) return;
  list.replaceChildren(); $("#resourceCount").textContent = `${resources.length} ITEMS`;
  resources.forEach(r => {
    const row = document.createElement("div"); row.className = "admin-project-item";
    const info = document.createElement("div"); const name = document.createElement("strong"); name.textContent = r.title;
    const meta = document.createElement("small"); meta.textContent = `${r.category === "pdf" ? "PDF reviewer" : "Logo design"} · ${r.is_published ? "Published" : "Draft"}`;
    info.append(name, meta);
    const actions = document.createElement("div"); actions.className = "admin-item-actions";
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "text-action"; edit.textContent = "EDIT"; edit.addEventListener("click", () => editResource(r.id));
    const del = document.createElement("button"); del.type = "button"; del.className = "text-action delete"; del.textContent = "DELETE";
    del.addEventListener("click", async () => {
      if (!confirm(`Permanently delete “${r.title}”?`)) return;
      const { data, error } = await db.from("resources").delete().eq("id", r.id).select("id").maybeSingle();
      if (error) return setMessage("#resourceMessage", error.message, true);
      if (!data) return setMessage("#resourceMessage", "Delete was not applied. Check administrator permissions.", true);
      if (r.file_path) await db.storage.from("portfolio-resources").remove([r.file_path]);
      await loadResources(); setMessage("#resourceMessage", "Resource deleted.");
    });
    actions.append(edit, del); row.append(info, actions); list.append(row);
  });
}
async function handleResourceSave(event) {
  event.preventDefault(); if (!currentUser) return;
  const form = event.currentTarget, button = $("#saveResourceButton");
  button.disabled = true; button.textContent = "Saving…";
  try {
    const values = Object.fromEntries(new FormData(form).entries());
    const category = values.category;
    const file = form.elements.resource_file.files[0];
    let filePath = form.dataset.filePath || "";
    if (file) {
      const max = category === "pdf" ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > max) throw new Error(`File exceeds the ${category === "pdf" ? "50 MB" : "10 MB"} limit.`);
      if (category === "pdf" && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Please upload a PDF file.");
      if (category === "logo" && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Please upload a PNG, JPG, or WEBP image.");
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(-90);
      const newPath = `${category}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await db.storage.from("portfolio-resources").upload(newPath, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const oldPath = filePath; filePath = newPath;
      form.dataset.pendingOldPath = oldPath;
    }
    if (!filePath) throw new Error("Please select a file to upload.");
    const payload = { category, title: values.title.trim(), description: (values.description || "").trim(), tags: (values.tags || "").trim(), file_path: filePath, is_published: form.elements.is_published.checked };
    let result = values.id ? await db.from("resources").update(payload).eq("id", values.id).select("id").maybeSingle() : await db.from("resources").insert(payload).select("id").single();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("No resource record was saved. Verify your admin allowlist and RLS policies.");
    const oldPath = form.dataset.pendingOldPath;
    if (oldPath && oldPath !== filePath) await db.storage.from("portfolio-resources").remove([oldPath]);
    delete form.dataset.pendingOldPath;
    await loadResources(); clearResourceForm(); setMessage("#resourceMessage", "Resource saved successfully.");
  } catch (error) { console.error(error); setMessage("#resourceMessage", error.message || "Unable to save resource.", true); }
  finally { button.disabled = false; button.textContent = "Save resource"; }
}
function setAdminTab(tab) {
  document.querySelectorAll("[data-tab-panel]").forEach(panel => panel.hidden = panel.dataset.tabPanel !== tab);
  document.querySelectorAll("[data-admin-tab]").forEach(link => link.classList.toggle("active", link.dataset.adminTab === tab));
  const titles = { overview: "Workspace overview", projects: "Applications", resources: "PDFs & logo designs", about: "Edit About Me" };
  $("#dashboardGreeting").textContent = titles[tab] || titles.overview;
}

async function boot() {
  $("#year").textContent = new Date().getFullYear();
  applyTheme(localStorage.getItem("leonbathan-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  document.querySelectorAll("[data-theme-toggle]").forEach(button => button.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")));
  document.querySelectorAll("[data-admin-tab]").forEach(link => link.addEventListener("click", e => { e.preventDefault(); setAdminTab(link.dataset.adminTab); }));
  document.querySelectorAll("[data-go-tab]").forEach(button => button.addEventListener("click", () => setAdminTab(button.dataset.goTab)));
  document.querySelectorAll("[data-resource-filter]").forEach(button => button.addEventListener("click", () => { resourceFilter = button.dataset.resourceFilter; document.querySelectorAll("[data-resource-filter]").forEach(b => b.classList.toggle("active", b === button)); renderPublicResources(); }));
  $("#resourceCategory").addEventListener("change", updateResourceFileControl);
  $("#aboutForm").addEventListener("submit", handleAboutSave);
  $("#resetAboutForm").addEventListener("click", async () => { await loadAboutProfile(); populateAboutForm(); setMessage("#aboutMessage", "Loaded the currently saved About content."); });
  $("#resourceForm").addEventListener("submit", handleResourceSave);
  $("#clearResourceForm").addEventListener("click", clearResourceForm);
  updateResourceFileControl();
  $("#menuToggle").addEventListener("click", () => $("#mainNav").classList.toggle("open"));
  $("#refreshProjects")?.addEventListener("click", async () => {
    const button = $("#refreshProjects");
    button.disabled = true;
    button.textContent = "REFRESHING…";
    try { await loadProjects(); }
    finally { button.disabled = false; button.textContent = "REFRESH PROJECTS ↻"; }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && location.hash !== "#admin") loadProjects();
  });
  window.addEventListener("focus", () => {
    if (location.hash !== "#admin") loadProjects();
  });
  $("#mainNav").addEventListener("click", e => { if (e.target.closest("a")) $("#mainNav").classList.remove("open"); });
  $("#contactForm").addEventListener("submit", e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    const subject = encodeURIComponent(`Portfolio enquiry from ${d.name}`);
    const body = encodeURIComponent(`From: ${d.name}\nReply to: ${d.email}\n\n${d.message}`);
    window.location.href = `mailto:your.email@example.com?subject=${subject}&body=${body}`;
  });
  $("#projectForm").addEventListener("submit", handleProjectSave);
  $("#cancelEdit").addEventListener("click", clearForm);
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!db) return setMessage("#loginMessage", "Supabase configuration is missing.", true);
    const values = Object.fromEntries(new FormData(e.currentTarget).entries());
    const { error } = await db.auth.signInWithPassword({ email: values.email, password: values.password });
    if (error) return setMessage("#loginMessage", error.message, true);
    await refreshSession();
  });
  $("#logoutButton").addEventListener("click", async () => {
    await db.auth.signOut(); currentUser = null; projects = [];
    showAuthState(false); clearForm(); location.hash = "#admin";
  });
  if (!supabaseReady) {
    setMessage("#loginMessage", "Supabase configuration is missing. Check supabase-config.js.", true);
  } else {
    db.auth.onAuthStateChange(() => { setTimeout(refreshSession, 0); });
    await loadProjects();
    await loadResources();
    await refreshSession();
  }
  route();
}
function route() {
  const admin = location.hash === "#admin";
  $("#publicView").hidden = admin;
  $("#adminView").hidden = !admin;
  if (!admin) window.scrollTo(0, 0);
  else if (currentUser) renderAdminList();
}
window.addEventListener("hashchange", route);
boot();
