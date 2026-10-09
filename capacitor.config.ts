import type { CapacitorConfig } from "@capacitor/cli";

// appId is the app's permanent identifier on the App Store; it can't change after the first submission.
const config: CapacitorConfig = {
  appId: "app.drumskills.ios",
  appName: "DrumSkills",
  webDir: "ios-www",
  backgroundColor: "#080909",
  ios: { contentInset: "never" },
};

export default config;
