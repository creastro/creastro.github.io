/** Theory topics for the parameters and panels, and the short tooltips. */

const R = String.raw

export interface ParamTopic {
  readonly title: string
  readonly what: string
  readonly theory: string[]
  readonly formulas: { tex: string; note: string }[]
  readonly sim: string
  readonly refs: string[]
  readonly see: string[]
}

export const PARAMETER_TOPICS: Record<string, ParamTopic> = {
  basics: {
    title: 'Basics: how to read this lab',
    what: 'A coronagraph is an instrument inside a telescope that removes the light of a star so that much fainter planets next to it can be seen. This lab follows the light through every element and shows how each one changes it.',
    theory: [
      R`Light from the star and the planet enters the telescope, passes a pupil plane ({{planes|plane A}}) where an apodizer or phase plate may sit, reflects off a {{dm|deformable mirror}}, is split towards a {{sensors|wavefront sensor}}, comes to a focus where a {{coronagraphs|focal-plane mask}} acts (B), reaches a second pupil image where the {{lyotstop|Lyot stop}} blocks diffracted starlight (C), and is finally imaged on the {{image|detector}} (D).`,
      R`Angles are in units of $\lambda/D$, the diffraction scale of the telescope. Brightness is in {{contrast|raw contrast}}: the fraction of a planet's peak brightness that the leftover starlight reaches.`,
      R`The Beginner mode offers a guided tour and a few controls. The Expert mode exposes every parameter, log or linear images, phase maps, curves and data export.`,
    ],
    formulas: [{ note: 'Fraunhofer propagation between pupil and focal planes', tex: R`E_{\rm focal}(\mathbf u)=\int E_{\rm pupil}(\mathbf x)\,e^{-2\pi i\,\mathbf u\cdot\mathbf x}\,d^2x` }],
    sim: R`Scalar Fraunhofer optics with FFTs and matrix Fourier transforms; see {{numerics|the numerical method}}.`,
    refs: ['guyon2006', 'por2018'], see: ['planes', 'contrast', 'coronagraphs', 'sensors', 'loop'],
  },
  coronagraphs: {
    title: 'Families of coronagraphs',
    what: 'Coronagraphs either block or reshape the starlight with amplitude masks (Lyot, APLC, band-limited, shaped pupil) or change its phase so that it cancels itself (Roddier, four-quadrant, vortex, apodizing phase plate).',
    theory: [R`They are judged by the depth of the starlight suppression (raw contrast), the inner working angle (how close to the star a planet survives), the throughput for planet light, the robustness to aberrations and the bandwidth. Guyon et al. (2006) compared many designs against the fundamental limits set by the stellar diameter and the wave nature of light.`],
    formulas: [{ note: 'generic Lyot-type coronagraph', tex: R`E_D=\mathcal F\{L\cdot\mathcal F^{-1}\{M\cdot\mathcal F\{A\cdot E_{\rm pupil}\}\}\}` }],
    sim: 'Choose the design in the Coronagraph menu; each has its own info panel.', refs: ['guyon2006'], see: ['lyot', 'aplc', 'bandlimited', 'shaped', 'roddier', 'fqpm', 'vortex', 'app'],
  },
  sensors: {
    title: 'Wavefront sensors',
    what: 'A wavefront sensor turns invisible phase errors into intensities a camera can measure. Pupil-plane sensors work in a separate arm after a beam splitter; focal-plane methods use the science camera itself.',
    theory: [R`Pupil-plane sensors (Shack–Hartmann, pyramid, Zernike, curvature) are fast and drive the adaptive-optics loop, but they cannot see the non-common-path aberrations of the science arm. Focal-plane methods (pairwise probing, phase diversity, self-coherent camera) measure what the coronagraph actually lets through, which is what a dark hole needs.`],
    formulas: [{ note: 'linear reconstruction from a calibrated interaction matrix D', tex: R`\hat c=(D^{T}D+\alpha I)^{-1}D^{T}(s-s_{\rm ref})` }],
    sim: 'Each sensor is calibrated by pushing and pulling the DM modes; the panel shows its raw signal and its estimate against the truth.',
    refs: ['guyon2005'], see: ['shack-hartmann', 'pyramid', 'zernike', 'curvature', 'pairwise', 'phase-diversity', 'scc', 'ncpa'],
  },
  planes: {
    title: 'The optical train and its planes',
    what: 'Click a plane in the diagram, or a card below it, to see the light before and after that element at a large size.',
    theory: [R`Planes A and C are images of the telescope pupil; planes B and D are images of the sky. Going from a pupil plane to a focal plane is a Fourier transform. The starlight is drawn in orange and the planet light in blue; the planet focuses a little off-centre and so misses the focal-plane mask.`],
    formulas: [{ note: 'pupil ↔ focal plane', tex: R`E_B=\mathcal F\{E_A\},\qquad E_C=\mathcal F^{-1}\{M\,E_B\}` }],
    sim: 'Thumbnails show the on-axis star at the central wavelength. In Expert mode they also show the phase.', refs: ['soummer2007'], see: ['coronagraphs', 'lyotstop'],
  },
  image: {
    title: 'The detector image',
    what: 'The final image: the leftover starlight plus the planets, in raw-contrast units. The logarithmic scale shows many factors of ten at once.',
    theory: [R`Each image is normalised to the peak of an off-axis source seen through the same instrument without its focal-plane mask, so a planet of flux ratio $10^{-6}$ peaks near $10^{-6}$ (times its throughput). Colour maps are perceptually uniform and readable with colour-vision deficiencies.`],
    formulas: [{ note: 'image of star and planets', tex: R`I=|E_\star|^2+\sum_p f_p\,|E_p|^2` }],
    sim: 'In broadband mode the image sums several wavelengths incoherently.', refs: ['guyon2006'], see: ['contrast', 'noise'],
  },
  contrast: {
    title: 'Raw contrast curve',
    what: 'How bright the leftover starlight is, averaged in rings around the star, compared with the bare telescope. Lower is better: a planet is visible where its flux ratio is above this curve.',
    theory: [R`The curve averages the normalised star image over annuli, restricted to the region the design is meant to darken (one side for the APP, a wedge for the shaped pupil). It is a "raw" contrast: no post-processing.`],
    formulas: [{ note: 'raw contrast at separation r', tex: R`C(r)=\frac{\langle I_\star(\mathbf u)\rangle_{|\mathbf u|=r}}{I_{\rm off\text{-}axis}(0)}` }],
    sim: 'Bin width 0.5 λ/D; the dashed curve is the bare telescope with the same errors.', refs: ['guyon2006', 'malbet1995'], see: ['throughput', 'darkhole'],
  },
  throughput: {
    title: 'Planet throughput and inner working angle',
    what: 'How much of a planet’s light survives the coronagraph as a function of its distance from the star. The inner working angle (IWA) is where it reaches half of its maximum.',
    theory: [R`Core throughput: the energy of the planet image within 0.7 $\lambda/D$ of its centre, divided by the same quantity for the bare telescope. Masks block planets near the star; designs without a focal mask (shaped pupil, APP) do not dim the planet, and their IWA is the inner edge of their dark zone.`],
    formulas: [{ note: 'core throughput', tex: R`T(s)=\frac{\int_{|\mathbf u-\mathbf s|<0.7}I_p\,d^2u}{\int_{|\mathbf u-\mathbf s|<0.7}I_{p,\rm bare}\,d^2u}` }],
    sim: 'Computed on request (it takes one propagation per separation).', refs: ['guyon2006', 'mawet2005'], see: ['contrast'],
  },
  pupil: {
    title: 'Telescope pupil',
    what: 'The shape of the light-collecting mirror as seen by the light: a clear circle, a circle with a central obstruction and spider vanes, or a mosaic of hexagonal segments.',
    theory: [R`Obstructions, vanes and segment gaps diffract light into spikes and rings that many coronagraphs cannot remove: the vortex and four-quadrant nulls, for example, require a clear circular pupil. The APLC and APP can be designed for any shape.`],
    formulas: [{ note: 'image of the pupil P', tex: R`I(\mathbf u)=|\mathcal F\{P\}|^2` }],
    sim: 'Edges are supersampled 4 × 4; the Lyot stop of a segmented pupil is its inscribed circle.', refs: ['soummer2005'], see: ['lyotstop'],
  },
  wavelength: {
    title: 'Wavelength and bandwidth',
    what: 'All angles scale with wavelength: the same mask is effectively smaller in λ/D at longer wavelengths, and aberrations of fixed height are smaller in waves.',
    theory: [R`Broadband images are the incoherent sum of several wavelengths. Fixed physical masks (Lyot, band-limited, Roddier) and the classical APP are chromatic; the vortex, the four-quadrant mask (in this idealised model) and the vector APP use a geometric phase that does not depend on wavelength.`],
    formulas: [{ note: 'phase of an optical path error W', tex: R`\phi=\frac{2\pi}{\lambda}W` }],
    sim: 'Uniform samples over λ0(1 ± Δλ/2λ0); control loops use λ0 only.', refs: ['kuchner2002', 'otten2017'], see: ['app', 'bandlimited'],
  },
  aberrations: {
    title: 'Aberrations',
    what: 'Small errors in the shape of the optics. Each nanometre of error scatters starlight into speckles that look like planets.',
    theory: [R`Low-order errors are described by Zernike polynomials (Noll's normalisation: the coefficient is the RMS of the mode). Polishing errors at all scales are modelled by a random phase screen with a power-law spectrum $\propto f^{-\alpha}$. A phase error of spatial frequency $f$ cycles per pupil puts a pair of speckles at $\pm f\,\lambda/D$, with an intensity $\approx(\pi a/\lambda)^2$ for a ripple of amplitude $a$ (Malbet et al. 1995).`],
    formulas: [{ note: 'wavefront', tex: R`W(\mathbf x)=\sum_j c_j Z_j(\mathbf x)+W_{\rm screen}(\mathbf x)` }],
    sim: 'Screens are drawn with a fixed seed; amplitude errors use a flatter spectrum.', refs: ['noll1976', 'malbet1995'], see: ['ncpa', 'sensors'],
  },
  ncpa: {
    title: 'Non-common-path aberrations (NCPA)',
    what: 'Errors located after the beam splitter, in the science arm only. The pupil-plane wavefront sensor never sees them.',
    theory: [R`Because the AO loop flattens the wavefront seen by its own sensor, NCPA survive as slowly varying "quasi-static" speckles, a major limit of ground-based coronagraphs. Focal-plane methods (phase diversity, Zernike sensor calibration, pairwise probing with EFC, the SCC) measure them in the science image.`],
    formulas: [{ note: 'what each arm sees', tex: R`W_{\rm sci}=W_{\rm common}+W_{\rm NCPA}+W_{\rm DM},\qquad W_{\rm WFS}=W_{\rm common}+W_{\rm DM}` }],
    sim: 'NCPA are added only to the science-arm OPD.', refs: ['ndiaye2013', 'galicher2010'], see: ['phase-diversity', 'pairwise'],
  },
  planets: {
    title: 'Planets',
    what: 'Off-axis point sources at a separation (λ/D), position angle and flux ratio. Their light is incoherent with the star, so their images add in intensity.',
    theory: [R`A planet at angle $\mathbf s$ is a tilted plane wave in the pupil: $E_p=P\,e^{2\pi i\,\mathbf s\cdot\mathbf x}$. Its image passes the coronagraph with the throughput of the design at that separation.`],
    formulas: [{ note: 'tilted wave', tex: R`E_p(\mathbf x)=P(\mathbf x)\,e^{i\phi(\mathbf x)}\,e^{2\pi i\,\mathbf s\cdot\mathbf x}` }],
    sim: 'Up to three planets; flux ratios from 1e-10 to 1e-2.', refs: ['guyon2006'], see: ['throughput'],
  },
  dm: {
    title: 'Deformable mirror',
    what: 'A thin mirror pushed by a grid of actuators that can change its shape by nanometres to cancel the wavefront errors.',
    theory: [R`An $N\times N$ actuator mirror controls spatial frequencies up to $N/2$ cycles per pupil, so it can clean a dark hole out to $N/2$ $\lambda/D$. Each actuator pushes a smooth bump (Gaussian influence function); the coupling is the response at the neighbouring actuator.`],
    formulas: [{ note: 'influence function', tex: R`h_k(\mathbf x)=\exp\left[\ln c\,\frac{|\mathbf x-\mathbf x_k|^2}{p^2}\right]` }],
    sim: 'Commands are in nm of wavefront.', refs: ['malbet1995'], see: ['darkhole', 'loop'],
  },
  darkhole: {
    title: 'Dark hole',
    what: 'The region of the image where the deformable mirror is asked to remove the starlight.',
    theory: [R`Malbet et al. (1995) proposed using a DM to dig such "dark holes". With one DM, both the amplitude and phase of the speckle field can be cancelled in half of the field (a one-sided hole); a full annulus can be corrected only for phase errors.`],
    formulas: [{ note: 'mean contrast in the hole H', tex: R`C_H=\frac{1}{|H|}\sum_{\mathbf u\in H}|E(\mathbf u)|^2` }],
    sim: 'Sampled at 2 pixels per λ/D at λ0.', refs: ['malbet1995', 'giveon2007', 'trauger2007'], see: ['efc', 'speckle-nulling', 'pairwise'],
  },
  loop: {
    title: 'Closed-loop control',
    what: 'Measure, correct, repeat. Each iteration updates the deformable mirror from the latest measurement; the plots show the contrast and the wavefront error after each step.',
    theory: [R`Pupil-plane sensors drive a modal integrator (the AO loop). The science camera drives speckle nulling or EFC, which dig a dark hole and also correct the NCPA. The loop gain sets how much of each correction is applied.`],
    formulas: [{ note: 'integrator', tex: R`a_{k+1}=a_k+g\,\Delta a_k` }],
    sim: 'Up to 30 iterations per run; the DM state persists until reset.', refs: ['giveon2007', 'borde2006'], see: ['ao', 'efc', 'speckle-nulling'],
  },
  lyotstop: {
    title: 'Lyot stop',
    what: 'A mask in the image of the pupil (plane C) that blocks the starlight diffracted to the pupil edges by the focal-plane mask.',
    theory: [R`Undersizing the stop removes more starlight but also more planet light and degrades resolution. Its central block and vane widths must cover the obstruction and spiders of the pupil.`],
    formulas: [{ note: 'after the stop', tex: R`E_C'=L\cdot E_C` }],
    sim: 'Diameter and central block are adjustable in Expert mode.', refs: ['lyot1939', 'sivaramakrishnan2001'], see: ['lyot', 'vortex'],
  },
  noise: {
    title: 'Detector noise',
    what: 'Photon noise (the random arrival of photons) and read noise of the detector.',
    theory: [R`Counts in a pixel follow a Poisson law of mean $N_0 I$ (with $N_0$ photons in the off-axis PSF peak), plus Gaussian read noise. Faint planets need enough photons to rise above the noise of the leftover starlight.`],
    formulas: [{ note: 'counts', tex: R`n\sim\mathrm{Poisson}(N_0 I)+\mathcal N(0,\sigma_{\rm RN}^2)` }],
    sim: 'Only the science image is noisy; the wavefront sensors are noiseless.', refs: ['guyon2005'], see: ['image'],
  },
  numerics: {
    title: 'Numerical method and limits',
    what: 'How the lab computes the light, and what it leaves out.',
    theory: [
      R`Pupil grids have 64 (or 128) samples across $D$. Focal planes are computed with matrix Fourier transforms at any sampling (Soummer et al. 2007); compact masks use the Babinet form, the vortex and four-quadrant masks a multi-scale scheme, the band-limited mask its exact pupil-plane convolution. The physics is tested against analytic results (Airy ring, Parseval, perfect nulls, throughput) in the package's test suite.`,
      R`Limits: scalar, monochromatic-per-sample Fraunhofer optics; no polarisation aberrations, no atmosphere turbulence in time, no Fresnel propagation between optics, noiseless sensors, and a pixelated pupil edge that sets a contrast floor near $10^{-8}$ for the phase masks.`,
    ],
    formulas: [{ note: 'matrix Fourier transform', tex: R`F=W\,A_v\,E\,A_u^{T},\quad (A_u)_{kj}=e^{-2\pi i u_k x_j}` }],
    sim: 'A comparable open-source simulator is HCIPy (Por et al. 2018).', refs: ['soummer2007', 'por2018'], see: ['basics'],
  },
}

export const TIPS: Record<string, string> = {
  pupil: 'Shape of the telescope mirror: clear, obstructed with spider vanes, or hexagonal segments.',
  obsc: 'Diameter of the central obstruction (secondary mirror or empty central segment).',
  spiders: 'Number of vanes holding the secondary mirror.', spiderw: 'Width of each spider vane.',
  rings: 'Rings of hexagonal segments around the centre.', gap: 'Gap between segments, as a fraction of the segment width.',
  lam: 'Central wavelength λ0. Masks are defined in λ0/D.', band: 'Width of the band of wavelengths summed in the image.',
  nlam: 'Number of wavelengths sampled across the band.', npup: 'Samples across the pupil: 128 is finer but about 4× slower.',
  fov: 'Half-width of the detector image in λ0/D.',
  cor: 'Which coronagraph is in the beam.', charge: 'Number of 2π phase windings of the vortex around its centre.',
  rmask: 'Radius of the focal-plane mask in λ0/D.', eps: 'Width of the band-limited kernel; the Lyot stop shrinks by this much.',
  lyout: 'Outer diameter of the Lyot stop as a fraction of the pupil.', lyin: 'Diameter of the central block of the Lyot stop.',
  spband: 'The shaped pupil concentrates the starlight within ±b λ/D along x; beyond it is dark.',
  spopen: 'Number of stacked openings; more openings widen the dark zones.',
  appiwa: 'Inner edge of the APP dark hole.', appowa: 'Outer edge of the APP dark hole.',
  vapp: 'Vector APP: geometric phase, the same at every wavelength, opposite in the two circular polarisations.',
  vchan: 'Which polarisation channel to image.', vleak: 'Fraction of light that leaks through without the phase pattern.',
  screen: 'RMS of a random wavefront error with a power-law spectrum.', slope: 'Steepness of the error spectrum: larger values put more error at low spatial frequencies.',
  ampl: 'RMS error of the transmission (reflectivity) across the pupil.', ncpa: 'Random errors in the science arm only, invisible to the pupil-plane sensor.',
  nplanets: 'How many planets orbit the star.',
  wfs: 'Which wavefront sensor measures the errors.', nsub: 'Number of lenslets across the pupil.',
  mod: 'Radius of the circular modulation around the pyramid apex.', zdist: 'Distance of the defocused images, as λz/D².',
  modes: 'Number of Zernike modes the AO loop controls.', ctl: 'Algorithm that turns measurements into DM commands.',
  est: 'How EFC learns the dark-hole field.', gain: 'Fraction of each correction applied per iteration.',
  dhiwa: 'Inner edge of the dark hole.', dhowa: 'Outer edge of the dark hole (at most nact/2 λ/D).',
  dhhalf: 'One side of the star only: lets one DM correct amplitude as well as phase.', alpha: 'Tikhonov regularisation of EFC.',
  nact: 'Number of DM actuators across the pupil.', coupling: 'Response of an actuator’s neighbour, a fraction of its own.',
  noise: 'Add photon (Poisson) and read noise to the science image.', photons: 'Photons in the peak of an unocculted off-axis source.',
  rn: 'Detector read noise in electrons.',
  'mode-beginner': 'Guided tour, presets and a few controls.', 'mode-expert': 'Every parameter, phase maps, curves and data export.',
  'loop-run': 'Run the control loop for the given number of iterations.', 'loop-stop': 'Stop the loop after the current iteration.',
  'loop-reset': 'Flatten the deformable mirror and clear the history.', 'tp-run': 'Compute planet throughput against separation and the inner working angle.',
  'save-image': 'Download the detector image as a PNG file.', 'save-curve': 'Download the contrast curve as CSV.',
  'save-tp': 'Download the throughput curve as CSV.', 'save-loop': 'Download the loop history as CSV.',
  cmap: 'Colour map of the images: all three are perceptually uniform and colour-blind safe.',
  scale: 'Logarithmic or linear brightness scale.', range: 'Number of factors of ten shown below the brightest value (log scale).',
}
