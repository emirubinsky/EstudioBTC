const revealSections = document.querySelectorAll(".reveal");
const signupForms = document.querySelectorAll(".signup-form");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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
  signupForms.forEach((form) => {
    form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();

        const button = form.querySelector("button");
        const note = form.querySelector("small");

        if (button) {
          button.textContent = "Solicitud enviada";
          button.disabled = true;
        }

        if (note) {
          note.textContent =
            "Gracias. EstudioBTC se va a contactar contigo dentro de las próximas 24 horas hábiles.";
        }
      },
      { once: true }
    );
  });
}

initRevealSections();
initSignupForms();
