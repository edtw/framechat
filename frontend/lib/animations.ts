import { Variants } from 'framer-motion'

// Easing curves personalizadas
export const easings = {
  // Apple-style easing
  apple: [0.4, 0.0, 0.2, 1] as const,
  // Smooth easing
  smooth: [0.22, 1, 0.36, 1] as const,
  // Bounce easing
  bounce: [0.68, -0.55, 0.265, 1.55] as const,
  // Elastic easing
  elastic: [0.175, 0.885, 0.32, 1.275] as const,
}

// Variantes de animação reutilizáveis
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -40 },
}

export const fadeInScale: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
}

export const slideInLeft: Variants = {
  initial: { opacity: 0, x: -60 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 60 },
}

export const slideInRight: Variants = {
  initial: { opacity: 0, x: 60 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -60 },
}

export const rotateIn: Variants = {
  initial: { opacity: 0, rotateX: 15, rotateY: -15 },
  animate: { opacity: 1, rotateX: 0, rotateY: 0 },
  exit: { opacity: 0, rotateX: -15, rotateY: 15 },
}

// Configurações de transição
export const transitions = {
  default: {
    duration: 0.8,
    ease: easings.smooth,
  },
  slow: {
    duration: 1.2,
    ease: easings.smooth,
  },
  fast: {
    duration: 0.4,
    ease: easings.smooth,
  },
  spring: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 30,
  },
  bounce: {
    type: 'spring' as const,
    stiffness: 260,
    damping: 20,
  },
}

// Animações de hover para cards
export const cardHover = {
  scale: 1.05,
  y: -12,
  rotateY: 5,
  transition: {
    duration: 0.3,
    ease: easings.smooth,
  },
}

export const cardTap = {
  scale: 0.98,
  transition: {
    duration: 0.1,
  },
}

// Animação de pulso para elementos destacados
export const pulse = {
  scale: [1, 1.05, 1],
  opacity: [0.5, 0.8, 0.5],
  transition: {
    duration: 2,
    repeat: Infinity,
    ease: 'easeInOut',
  },
}

// Animação de shimmer/brilho
export const shimmer = {
  backgroundPosition: ['200% 0', '-200% 0'],
  transition: {
    duration: 8,
    repeat: Infinity,
    ease: 'linear',
  },
}

// Configuração de viewport para scroll animations
export const viewport = {
  once: true,
  margin: '-100px',
  amount: 0.3,
}
