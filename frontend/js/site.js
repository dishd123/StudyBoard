const nav = document.querySelector('#site-nav');
const footer = document.querySelector('#site-footer');

if (nav) {
  nav.innerHTML = `<nav class="navbar navbar-expand-lg site-nav"><div class="container"><a class="navbar-brand" href="/"><span class="brand-mark">S</span> StudyBoard</a><button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation"><span class="navbar-toggler-icon"></span></button><div class="collapse navbar-collapse" id="mainNav"><ul class="navbar-nav ms-auto align-items-lg-center gap-lg-2"><li class="nav-item"><a class="nav-link" href="/">Home</a></li><li class="nav-item"><a class="nav-link" href="/about.html">About</a></li><li class="nav-item"><a class="nav-link" href="/contact.html">Contact</a></li><li class="nav-item"><a class="nav-link" href="/app/">App</a></li><li class="nav-item"><a class="btn btn-sm btn-dark nav-login" href="/login/">Sign in</a></li></ul></div></div></nav>`;
  nav.querySelector('nav').setAttribute('aria-label', 'Main navigation');
  const current = window.location.pathname === '/index.html' ? '/' : window.location.pathname;
  nav.querySelectorAll('.nav-link').forEach((link) => {
    const linkPath = new URL(link.href).pathname;
    if (current === linkPath) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

if (footer) footer.innerHTML = `<footer class="site-footer"><div class="container d-flex flex-column flex-md-row justify-content-between gap-2"><span>© 2026 StudyBoard</span><span>Learning, connected.</span></div></footer>`;

const contactForm = document.querySelector('#contact-form');
if (contactForm) contactForm.addEventListener('submit', (event) => { event.preventDefault(); document.querySelector('#contact-status').textContent = 'Thanks! Your message has reached the StudyBoard team.'; contactForm.reset(); });
