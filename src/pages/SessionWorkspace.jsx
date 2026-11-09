import React, { useState } from 'react';
import MaterialTab from '../components/MaterialTab.jsx';
import NotesTab from '../components/NotesTab.jsx';
import StudyTab from '../components/StudyTab.jsx';

const sections = [
  { id: 'material', label: 'Material' },
  { id: 'notes', label: 'Notes' },
  { id: 'study', label: 'Study' }
];

export default function SessionWorkspace({ session, cards, onBack, onPhotoChange, onAudioChange, onMockRebuild }) {
  const [activeSection, setActiveSection] = useState('material');

  return (
    <main className="app-shell">
      <div className="container">
        <button className="text-button" onClick={onBack}>← Back to dashboard</button>
        <div className="app-welcome workspace-heading">
          <div><p className="eyebrow">SAMPLE SESSION</p><h1>{session.title}</h1></div>
        </div>
        <p className="workspace-demo-notice">Frontend preview only. Photo import, recording, generated notes, and the real tutor are not connected.</p>
        <nav className="workspace-tabs" aria-label="Session sections">
          {sections.map((section) => (
            <button
              key={section.id}
              id={`section-${section.id}`}
              type="button"
              className={activeSection === section.id ? 'is-active' : ''}
              aria-pressed={activeSection === section.id}
              aria-controls="session-content"
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <section id="session-content" aria-labelledby={`section-${activeSection}`}>
          {activeSection === 'material' && <MaterialTab session={session} onPhotoChange={onPhotoChange} onAudioChange={onAudioChange} onMockRebuild={onMockRebuild} />}
          {activeSection === 'notes' && <NotesTab />}
          {activeSection === 'study' && <StudyTab cards={cards} />}
        </section>
      </div>
    </main>
  );
}
