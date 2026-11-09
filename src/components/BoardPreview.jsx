import React from 'react';

export default function BoardPreview({ session }) {
  return (
    <section className="workspace-panel board-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SAMPLE BOARD</p>
          <h2>{session.title.split(' · ')[1] || session.title}</h2>
        </div>
        <button className="icon-button" aria-label="More board options" disabled>•••</button>
      </div>
      <div className="board-preview">
        <img
          className="workspace-board-image"
          src="/images/app-board.jpg"
          alt="Project 1 sample photo of handwritten study material"
        />
      </div>
      <div className="board-meta">
        <span>The same Project 1 sample image is used for every demo session.</span>
        <span className="tag">Demo image</span>
      </div>
    </section>
  );
}
