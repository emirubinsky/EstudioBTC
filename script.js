const revealSections = document.querySelectorAll(".reveal");
const signupForms = document.querySelectorAll(".signup-form");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const formSuccessMessages = {
  inscripciones:
    "Consulta enviada. Te respondere a la brevedad. Si no ves mi respuesta en 24-48hs, revisá la carpeta de spam.",
  contacto:
    "Mensaje enviado. Te respondo a la brevedad.",
};

function revealAllSections() {
  revealSections.forEach((section) => {
    section.classList.add("is-visible");
  });
}

function initRevealSections() {
  if (!revealSections.length) return;

  if (!("IntersectionObserver" in window) || prefersReducedMotion.matches) {
    revealAllSections();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.18 }
  );

  revealSections.forEach((section) => observer.observe(section));
}

function initSignupForms() {
  if (!signupForms.length) return;

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "No detectada";

  signupForms.forEach((form) => {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("form");
    cleanUrl.searchParams.delete("sent");

    const nextUrl = new URL(cleanUrl.toString());
    nextUrl.searchParams.set("form", form.dataset.formId || "consulta");
    nextUrl.searchParams.set("sent", "1");

    const nextInput = form.querySelector('input[name="_next"]');
    const urlInput = form.querySelector('input[name="_url"]');
    const timezoneInput = form.querySelector('input[name="timezone"]');
    const dateInput = form.querySelector('input[type="date"]');

    if (nextInput) {
      nextInput.value = nextUrl.toString();
    }

    if (urlInput) {
      urlInput.value = cleanUrl.toString();
    }

    if (timezoneInput) {
      timezoneInput.value = timezone;
    }

    if (dateInput) {
      const today = new Date();
      const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
        .toISOString()
        .split("T")[0];

      dateInput.min = localDate;
    }
  });

  const currentUrl = new URL(window.location.href);
  const submittedFormId = currentUrl.searchParams.get("form");
  const wasSent = currentUrl.searchParams.get("sent") === "1";

  if (!wasSent || !submittedFormId) return;

  const form = document.querySelector(`.signup-form[data-form-id="${submittedFormId}"]`);

  if (!form) return;

  const note = form.querySelector("[data-form-note]");

  if (note) {
    note.textContent =
      formSuccessMessages[submittedFormId] ||
      "Consulta enviada. Revisá tu correo si necesitás activar el formulario por primera vez.";
  }

  form.scrollIntoView({
    behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    block: "center",
  });

  currentUrl.searchParams.delete("form");
  currentUrl.searchParams.delete("sent");
  window.history.replaceState({}, document.title, currentUrl.toString());
}

function initReadProgress() {
  const bar = document.getElementById("readProgress");
  if (!bar) return;

  function update() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = Math.min(pct, 100) + "%";
  }

  window.addEventListener("scroll", update, { passive: true });
  update();
}

initRevealSections();
initSignupForms();
initReadProgress();
