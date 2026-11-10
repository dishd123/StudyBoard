const links = [
  ['/', 'Home'],
  ['/about.html', 'About'],
  ['/contact.html', 'Contact'],
  ['/app/', 'App']
];

export default function SiteNav({ active }) {
  return (
    <nav className="navbar navbar-expand-lg site-nav" aria-label="Main navigation">
      <div className="container">
        <a className="navbar-brand" href="/">
          <span className="brand-mark">S</span> StudyBoard
        </a>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#mainNav"
          aria-controls="mainNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="mainNav">
          <ul className="navbar-nav ms-auto align-items-lg-center gap-lg-2">
            {links.map(([href, label]) => (
              <li className="nav-item" key={href}>
                <a className={href === active ? 'nav-link active' : 'nav-link'} href={href} aria-current={href === active ? 'page' : undefined}>
                  {label}
                </a>
              </li>
            ))}
            <li className="nav-item">
              <a className="btn btn-sm btn-dark nav-login" href="/login/" aria-current={active === '/login/' ? 'page' : undefined}>Sign in</a>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
