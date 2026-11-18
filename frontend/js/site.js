// Shared script of the static pages: Home, About, Contact and Privacy (issue #157).
// Adds the navigation bar and footer, loads Google Analytics, and handles the Contact form.

// Google Analytics 4 measurement id: the same id as measurementId in src/services/firebase.js.
const measurementId = 'G-KV2396432E';

// Load gtag.js only after the placeholder above has been replaced with the real id.
if (!measurementId.startsWith('G-XXXX')) {
  const gaScript = document.createElement('script');
  gaScript.async = true;
  gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(gaScript);
  // Google's standard gtag snippet: commands wait in dataLayer until gtag.js has loaded.
  // gtag.js needs the arguments object itself, so this is a plain function, not an arrow function.
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  // config also sends the page_view event for this page.
  window.gtag('config', measurementId);
}

const nav = document.querySelector('#site-nav');
const footer = document.querySelector('#site-footer');

// Fill the empty #site-nav div with the same menu the React pages show.
if (nav) {
  nav.innerHTML = `<nav class="navbar navbar-expand-lg site-nav"><div class="container"><a class="navbar-brand" href="/"><span class="brand-mark">S</span> StudyBoard</a><button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation"><span class="navbar-toggler-icon"></span></button><div class="collapse navbar-collapse" id="mainNav"><ul class="navbar-nav ms-auto align-items-lg-center gap-lg-2"><li class="nav-item"><a class="nav-link" href="/">Home</a></li><li class="nav-item"><a class="nav-link" href="/about.html">About</a></li><li class="nav-item"><a class="nav-link" href="/contact.html">Contact</a></li><li class="nav-item"><a class="nav-link" href="/app/">App</a></li><li class="nav-item"><a class="btn btn-sm btn-dark nav-login" href="/login/">Sign in</a></li></ul></div></div></nav>`;
  nav.querySelector('nav').setAttribute('aria-label', 'Main navigation');
  // Mark the link of the current page; /index.html and / are the same Home page.
  const current = window.location.pathname === '/index.html' ? '/' : window.location.pathname;
  nav.querySelectorAll('.nav-link').forEach((link) => {
    const linkPath = new URL(link.href).pathname;
    if (current === linkPath) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

// Fill the empty #site-footer div; the Privacy link is on every static page.
if (footer) {
  footer.innerHTML = `<footer class="site-footer"><div class="container d-flex flex-column flex-md-row justify-content-between gap-2"><span>© 2026 StudyBoard</span><a href="/privacy.html">Privacy</a><span>Learning, connected.</span></div></footer>`;
}

// The Contact form sends nothing: it says so, gives the class email instead, and clears the fields.
const contactForm = document.querySelector('#contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', (event) => {
    // Stop the browser from reloading the page on submit.
    event.preventDefault();
    document.querySelector('#contact-status').textContent = 'Thanks! This form does not send messages. Please email ddeshmukh2@horizon.csueastbay.edu instead.';
    contactForm.reset();
  });
}