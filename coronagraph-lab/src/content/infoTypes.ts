/** Structure of the info panels shown for each coronagraph, wavefront sensor and control algorithm. */

export interface Formula { readonly tex: string; readonly note: string }

export interface InfoEntry {
  readonly id: string
  readonly name: string
  readonly family: string
  /** Plain-language explanation for the Beginner mode (two or three sentences). */
  readonly beginner: string
  /** Expert explanation: how it works, with $inline TeX$. */
  readonly expert: readonly string[]
  readonly formulas: readonly Formula[]
  readonly strengths: readonly string[]
  readonly limitations: readonly string[]
  readonly instruments: readonly string[]
  /** Keys into REFERENCES; at least one must be a peer-reviewed journal article. */
  readonly refs: readonly string[]
  /** What the simulation does, and what it leaves out. */
  readonly sim: string
}
