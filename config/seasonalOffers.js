/**
 * Seasonal offer campaigns.
 * Dates use month-day format so they repeat yearly.
 * To activate a one-time campaign, add the full year.
 */
const campaigns = [
  {
    id: 'ramadan-2026',
    name: 'Ramadan Kareem',
    startDate: '2026-02-18',
    endDate: '2026-03-20',
    memberExtraDiscount: 0.03, // +3% for Prime on top of 5%
    specialPerks: ['Livraison nocturne gratuite', 'Emballage cadeau Ramadan'],
    bannerMessage: 'Ramadan Mubarak ! Profitez de livraisons nocturnes et de -3% supplémentaires pour les membres Prime.',
    theme: 'ramadan',
    icon: '🌙'
  },
  {
    id: 'eid-al-fitr-2026',
    name: 'Aïd el-Fitr',
    startDate: '2026-03-20',
    endDate: '2026-03-27',
    memberExtraDiscount: 0.05, // +5% for Prime
    specialPerks: ['Emballage cadeau premium gratuit', 'Livraison express J+1'],
    bannerMessage: 'Aïd Mubarak ! Emballage cadeau premium offert et -5% supplémentaires pour les membres Prime.',
    theme: 'eid',
    icon: '🎁'
  },
  {
    id: 'back-to-school-2026',
    name: 'Rentrée Scolaire',
    startDate: '2026-08-25',
    endDate: '2026-09-15',
    memberExtraDiscount: 0.02,
    specialPerks: ['Livraison gratuite sur le scolaire', 'Lots familles à prix réduit'],
    bannerMessage: 'C\'est la rentrée ! Offres exclusives sur le scolaire et -2% supplémentaires pour les membres Prime.',
    theme: 'school',
    icon: '📚'
  },
  {
    id: 'black-friday-2026',
    name: 'Black Friday',
    startDate: '2026-11-27',
    endDate: '2026-11-30',
    memberExtraDiscount: 0.07,
    specialPerks: ['Accès anticipé 24h avant', 'Flash deals exclusifs Prime'],
    bannerMessage: 'Black Friday ! Accès anticipé et -7% supplémentaires pour les membres Prime.',
    theme: 'blackfriday',
    icon: '🔥'
  },
  {
    id: 'new-year-2027',
    name: 'Bonne Année',
    startDate: '2026-12-26',
    endDate: '2027-01-05',
    memberExtraDiscount: 0.03,
    specialPerks: ['Emballage cadeau Nouvel An', 'Points fidélité x3'],
    bannerMessage: 'Bonne année ! Emballage cadeau offert et -3% supplémentaires pour les membres Prime.',
    theme: 'newyear',
    icon: '🎆'
  }
];

module.exports = campaigns;
