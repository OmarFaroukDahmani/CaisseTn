import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import activeDay from '../ActiveDay.jpeg';
import ingredients from '../Ingredients.jpeg';
import posRegister from '../POSRegister.jpeg';
import products from '../Products.jpeg';
import profile from '../Profile.jpeg';

const screens = [
  {
    title: 'Caisse du jour',
    description: 'Suivez vos journées et gardez un œil sur chaque écart.',
    image: activeDay,
    alt: 'Écran Caisse du jour de l’application CashierTn',
  },
  {
    title: 'Caisse enregistreuse',
    description: 'Enregistrez vos ventes et gérez vos shifts simplement.',
    image: posRegister,
    alt: 'Écran Caisse enregistreuse de l’application CashierTn',
  },
  {
    title: 'Produits',
    description: 'Retrouvez vos prix, vos coûts et vos marges en un coup d’œil.',
    image: products,
    alt: 'Écran Produits de l’application CashierTn',
  },
  {
    title: 'Stock & ingrédients',
    description: 'Gardez le contrôle sur vos ingrédients et vos recettes.',
    image: ingredients,
    alt: 'Écran Stock et ingrédients de l’application CashierTn',
  },
  {
    title: 'Votre profil',
    description: 'Accédez rapidement à vos rapports et à vos réglages.',
    image: profile,
    alt: 'Écran Profil de l’application CashierTn',
  },
];

function LandingPage() {
  const [activeScreen, setActiveScreen] = useState(0);
  const screen = screens[activeScreen];

  return (
    <div className="page">
      <header className="site-header">
        <a className="brand" href="#accueil" aria-label="CashierTn, accueil">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M5 14h22v13H5zM9 14a7 7 0 0 1 14 0" />
              <path d="M12 20h8" />
              <path className="brand-mark-accent" d="M16 4v5" />
            </svg>
          </span>
          <span className="brand-name">Caisse<span>Tn</span></span>
        </a>
        <div className="header-badge">
          <span className="status-dot" />
          Pensée pour les commerces tunisiens
        </div>
      </header>

      <main className="hero" id="accueil">
        <section className="hero-copy">
          <div className="eyebrow">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l1 2.5 2.5 1-2.5 1L19 23l-1-2.5-2.5-1 2.5-1 1-2.5Z" />
            </svg>
            La gestion, enfin plus simple
          </div>
          <h1>
            Votre caisse,
            <br />
            <span>sous contrôle.</span>
          </h1>
          <p className="hero-description">
            Gérez vos ventes, votre stock et vos journées depuis une seule
            application. Moins de calculs, plus de sérénité pour votre commerce.
          </p>

          <ul className="benefits">
            <li>
              <span className="check-icon" aria-hidden="true">✓</span>
              Suivi de caisse au quotidien
            </li>
            <li>
              <span className="check-icon" aria-hidden="true">✓</span>
              Ventes, produits et inventaire
            </li>
            <li>
              <span className="check-icon" aria-hidden="true">✓</span>
              Conçue pour TND et votre activité
            </li>
          </ul>

          <div className="availability">
            <span className="availability-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                <path d="M10 18.5h4" />
              </svg>
            </span>
            <span>
              <strong>Bientôt disponible</strong>
              <small>L’application qui simplifie votre quotidien</small>
            </span>
          </div>
        </section>

        <section className="app-preview" aria-label="Aperçu de l’application">
          <div className="phone">
            <div className="phone-screen">
              <img
                key={screen.image}
                className="app-screenshot"
                src={screen.image}
                alt={screen.alt}
              />
              <span className="camera-island" aria-hidden="true" />
            </div>
          </div>
          <div className="screen-caption" aria-live="polite">
            <h2>{screen.title}</h2>
            <p>{screen.description}</p>
          </div>
          <div className="screen-picker" aria-label="Choisir une capture d’écran">
            {screens.map((appScreen, index) => (
              <button
                key={appScreen.title}
                type="button"
                className={`screen-dot${index === activeScreen ? ' active' : ''}`}
                aria-label={`Afficher : ${appScreen.title}`}
                aria-pressed={index === activeScreen}
                onClick={() => setActiveScreen(index)}
              />
            ))}
          </div>
          <p className="picker-hint">Choisissez un écran pour découvrir l’application</p>
        </section>
      </main>

      <footer className="site-footer">
        CashierTn <span aria-hidden="true">·</span> La gestion de caisse, en toute simplicité.
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<LandingPage />);
