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
async function boot() {
  $("#year").textContent = new Date().getFullYear();
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
