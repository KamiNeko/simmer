import "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** The screen shows this mutation's error itself, so no toast is needed. */
      inlineError?: boolean;
    };
  }
}
