import type { CapacitorConfig } from "@capacitor/cli";

// appId is the app's permanent identifier in the store; it can't change after the first submission.
// iOS uses app.drumskills.ios (the default). Android uses app.drumskills.android: the android scripts set CAP_APP_ID.
const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID ?? "app.drumskills.ios",
  appName: "DrumSkills",
  webDir: "ios-www",
  backgroundColor: "#080909",
  ios: { contentInset: "never" },
};

export default config;
