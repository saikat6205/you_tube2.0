export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    currency: "INR",
    downloadsPerDay: 1,
    watchMinutesPerDay: 60,
    adFree: false,
    premiumAccess: false,
    tagline: "Get started for free",
  },
  bronze: {
    name: "Bronze",
    price: 99,
    currency: "INR",
    downloadsPerDay: 5,
    watchMinutesPerDay: 180,
    adFree: false,
    premiumAccess: true,
    tagline: "Unlock premium videos",
  },
  silver: {
    name: "Silver",
    price: 199,
    currency: "INR",
    downloadsPerDay: 20,
    watchMinutesPerDay: 480,
    adFree: true,
    premiumAccess: true,
    tagline: "Ad-free and more downloads",
  },
  gold: {
    name: "Gold",
    price: 499,
    currency: "INR",
    downloadsPerDay: Infinity,
    watchMinutesPerDay: Infinity,
    adFree: true,
    premiumAccess: true,
    tagline: "Unlimited everything",
  },
};

export const PLAN_NAMES = Object.keys(PLANS);

export const defaultPlan = "free";

export const getPlan = (plan) => PLANS[plan] || PLANS.free;