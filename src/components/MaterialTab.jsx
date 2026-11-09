import React from 'react';
import BoardPreview from './BoardPreview.jsx';

export default function MaterialTab({ session }) {
  return (
    <div className="row g-4">
      <div className="col-lg-7"><BoardPreview session={session} /></div>
      <div className="col-lg-5">
        <section className="workspace-panel">
          <p className="eyebrow">SESSION MATERIAL</p>
          <h2>One photo, one explanation.</h2>
          <p>Import a board photo and record its explanation. These actions are unavailable in this preview.</p>
          <div className="workspace-placeholder">
            <h3>Photo import</h3>
            <p>Choose a board photo through Google Photos.</p>
            <button className="btn btn-outline-dark" disabled>Import from Google Photos</button>
          </div>
          <div className="workspace-placeholder">
            <h3>Spoken explanation</h3>
            <p>Record an explanation in the browser.</p>
            <button className="btn btn-outline-dark" disabled>Record explanation</button>
          </div>
          <button className="btn btn-primary" disabled>Make notes and flashcards</button>
        </section>
      </div>
    </div>
  );
}
