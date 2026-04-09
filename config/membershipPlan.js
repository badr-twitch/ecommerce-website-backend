const plans = {
  monthly: {
    id: 'umod-prime-monthly',
    name: 'UMOD Prime Mensuel',
    price: 69.99,
    currency: 'MAD',
    billingCycle: 'Mensuel',
    billingCycleDays: 30,
    badge: 'Populaire'
  },
  annual: {
    id: 'umod-prime-annual',
    name: 'UMOD Prime Annuel',
    price: 599.99,
    currency: 'MAD',
    billingCycle: 'Annuel',
    billingCycleDays: 365,
    badge: 'Meilleure offre',
    savings: 239.89 // 69.99 * 12 - 599.99
  }
};

const sharedConfig = {
  tagline: 'Optimisez vos achats pour le marché marocain avec un abonnement premium pensé pour vous.',
  highlight: 'Livraison express gratuite au Maroc, offres VIP et conciergerie shopping 7j/7',
  perks: [
    {
      title: 'Livraison express illimitée',
      description: 'Expédition prioritaire gratuite partout au Maroc, sans minimum d\'achat.',
      icon: '🚚'
    },
    {
      title: 'Support client 24/7',
      description: 'Accès à un concierge dédié via WhatsApp et téléphone pour résoudre vos demandes en priorité.',
      icon: '🤝'
    },
    {
      title: 'Offres exclusives',
      description: 'Accès anticipé aux drops, ventes privées et remises supplémentaires jusqu\'à -20%.',
      icon: '🎁'
    },
    {
      title: 'Points fidélité boostés',
      description: 'Cumulez 2x plus de points sur chaque achat pour débloquer des chèques cadeaux.',
      icon: '💎'
    },
    {
      title: 'Retours simplifiés',
      description: 'Échanges gratuits pendant 60 jours et pick-up à domicile sur les grandes villes.',
      icon: '🔁'
    },
    {
      title: 'Shopping personnalisé',
      description: 'Sélections personnalisées par nos stylistes et recommandations IA adaptées au marché marocain.',
      icon: '🪄'
    }
  ],
  bonuses: [
    'Carte cadeau de bienvenue de 50 DH utilisable sur tout le site',
    'Accès aux ateliers live et masterclass beauté & lifestyle UMOD',
    'Surclassement automatique sur les commandes de cadeaux',
    'Assurance colis premium incluse'
  ],
  faqs: [
    {
      question: 'Comment fonctionne la facturation ?',
      answer: 'Le montant est débité selon votre plan (mensuel ou annuel). Vous pouvez annuler à tout moment, sans frais.'
    },
    {
      question: 'La livraison express couvre quelles villes ?',
      answer: 'Nous couvrons Casablanca, Rabat, Marrakech, Tanger, Fès, Agadir et la majorité des grandes villes. Pour les zones rurales, la livraison est prioritaire mais peut nécessiter un délai supplémentaire de 24h.'
    },
    {
      question: 'Puis-je partager mon abonnement ?',
      answer: 'Oui, UMOD Prime permet d\'ajouter un membre de votre famille pour bénéficier des avantages de livraison et des offres exclusives.'
    },
    {
      question: 'Comment annuler mon abonnement ?',
      answer: 'Vous pouvez annuler à partir de votre espace client. Les avantages restent actifs jusqu\'à la fin de la période en cours.'
    },
    {
      question: 'Quelle est la différence entre le plan mensuel et annuel ?',
      answer: 'Le plan annuel vous fait économiser 240 DH par rapport au plan mensuel. Les avantages sont identiques.'
    }
  ],
  cta: {
    primary: 'Rejoindre UMOD Prime',
    secondary: 'Découvrir les avantages',
    guarantee: 'Satisfait ou remboursé 30 jours'
  }
};

// Helper to get a full plan config (plan details + shared config)
function getPlan(planId) {
  const plan = Object.values(plans).find(p => p.id === planId);
  if (!plan) return null;
  return { ...plan, ...sharedConfig };
}

// Default plan (backward compat)
function getDefaultPlan() {
  return { ...plans.monthly, ...sharedConfig };
}

module.exports = { plans, sharedConfig, getPlan, getDefaultPlan };
