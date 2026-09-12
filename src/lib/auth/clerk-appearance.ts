import type { Appearance } from "@clerk/types";

/**
 * Shared Clerk appearance for SignIn / SignUp.
 * Extends the existing dark-theme variables with social OAuth button contrast.
 */
export const clerkAuthAppearance: Appearance = {
  variables: {
    colorBackground: "#121A2B",
    colorText: "#E8EEF9",
    colorPrimary: "#FF4D2E",
    colorInputBackground: "#0B1220",
    colorInputText: "#E8EEF9",
  },
  elements: {
    socialButtonsBlockButton: {
      backgroundColor: "#0B1220",
      border: "1px solid #1E2A40",
      color: "#E8EEF9",
      "&:hover": {
        backgroundColor: "#162033",
        color: "#FFFFFF",
        "& .cl-socialButtonsBlockButtonText": {
          color: "#FFFFFF",
        },
        "& .cl-socialButtonsProviderIcon": {
          color: "#FFFFFF",
        },
      },
    },
    socialButtonsBlockButtonText: {
      color: "#E8EEF9",
    },
    socialButtonsProviderIcon: {
      color: "#E8EEF9",
    },
    socialButtonsBlockButtonArrow: {
      color: "#8B9BB8",
    },
  },
};
