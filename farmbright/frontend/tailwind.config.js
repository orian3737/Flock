import daisyui from "daisyui";

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {},
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        farmbright: {
          primary: "#4caf50",
          secondary: "#90caf9",
          accent: "#ff8f00",
          neutral: "#162416",
          "base-100": "#0f1a0f",
          "base-200": "#162416",
          "base-300": "#1e321e",
          info: "#42a5f5",
          success: "#4caf50",
          warning: "#ff8f00",
          error: "#c62828",
          "--rounded-box": "0.5rem",
          "--rounded-btn": "0.375rem",
          "--rounded-badge": "999px",
        },
      },
    ],
    darkTheme: "farmbright",
  },
};
