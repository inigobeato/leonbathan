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
  $("#emptyProjects").hidden = projects.length > 0;
  projects.filter(p => p.is_published).forEach(p => {
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
      const { error } = await db.from("projects").delete().eq("id", p.id);
      if (error) return setMessage("#projectMessage", error.message, true);
      await loadProjects();
      setMessage("#projectMessage", "Project deleted.");
    });
    actions.append(edit, del); row.append(info, actions); list.append(row);
  });
}
async function loadProjects() {
  if (!db) return;
  const { data, error } = await db.from("projects").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    $("#emptyProjects").hidden = false;
    $("#emptyProjects").textContent = "Could not load projects. Check the Supabase setup instructions.";
    return;
  }
  projects = (data || []).map(normalizeProject);
  renderProjects();
  if (currentUser) renderAdminList();
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
    if (values.id) result = await db.from("projects").update(payload).eq("id", values.id);
    else result = await db.from("projects").insert(payload);
    if (result.error) throw result.error;
    clearForm();
    await loadProjects();
    setMessage("#projectMessage", "Saved successfully. Your public portfolio is updated.");
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
