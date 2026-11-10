// Point 1 / 3: client-side failure rules for the three paid generate calls.
// Only the SERVER may say "No Oracle was spent" (its own 503/402 body, shown
// verbatim). A dropped connection, bad JSON or a client-side throw can happen
// after the server committed the spend and the row, so those say "may have
// been saved". A retry reuses the attempt id and returns the saved row.
export function unconfirmedMessage(noun: "reading" | "report" | "interpretation", where: string): string {
  return `We lost the connection before we could confirm your ${noun}. It may have been saved: check ${where}, or try again. A retry returns the saved ${noun === "interpretation" ? "one" : noun} without spending another Oracle.`;
}

// Point 3: a signed-in generation must come back with the server's saved row.
// Building a local one would mint a new id the server does not know.
export function requireSavedReading<T>(signedIn: boolean, reading: T | undefined): T | undefined {
  if (signedIn && !reading) throw new Error("Server response had no saved reading");
  return reading;
}
