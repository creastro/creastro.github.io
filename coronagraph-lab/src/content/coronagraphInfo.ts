/** Info panels of the coronagraphs. Text paraphrases the cited papers; it does not quote them. */
import type { InfoEntry } from './infoTypes.ts'

const R = String.raw

export const CORONAGRAPH_INFO: readonly InfoEntry[] = [
  {
    id: 'none', name: 'No coronagraph', family: 'Baseline',
    beginner: 'The bare telescope. The star makes a bright spot with rings around it (the Airy pattern), and a faint planet nearby is lost in that glare. Every coronagraph is compared with this picture.',
    expert: [R`The detector field is the Fourier transform of the pupil field. For a clear circular pupil the image is the Airy pattern $[2J_1(\pi r)/(\pi r)]^2$ ($r$ in $\lambda/D$), whose rings fall only as $r^{-3}$: about $10^{-3}$ of the peak at 3 $\lambda/D$ and $10^{-4}$ at 7 $\lambda/D$, far brighter than a mature giant planet ($10^{-6}$–$10^{-9}$) or an Earth twin ($\sim10^{-10}$).`],
    formulas: [{ note: 'image of a point source', tex: R`I(\mathbf u)=\left|\mathcal F\{P(\mathbf x)\,e^{i\phi(\mathbf x)}\}\right|^2` }],
    strengths: ['Full throughput at every separation.'],
    limitations: ['Diffraction rings and aberration speckles hide faint companions within a few tens of λ/D.'],
    instruments: ['Every telescope without a coronagraph.'],
    refs: ['guyon2006'],
    sim: 'The baseline uses the same pupil, aberrations and detector as the coronagraphs, with no apodizer, mask or stop.',
  },
  {
    id: 'lyot', name: 'Classical Lyot coronagraph', family: 'Amplitude mask',
    beginner: 'An opaque spot in the focal plane blocks the core of the star image. What leaks around the spot is diffracted to the edge of the next pupil image, where a slightly smaller ring-shaped stop (the Lyot stop) cuts it away.',
    expert: [
      R`Lyot invented the instrument to observe the solar corona outside eclipses. The occulter (radius $r_m$) removes the low spatial frequencies of the star image; in the next pupil plane (C) the remaining field is the pupil minus a smoothed copy of itself, which is small inside the pupil and concentrated in a bright ring at its edge. The Lyot stop, undersized to a fraction of $D$, blocks that ring.`,
      R`A hard-edged occulter cannot null the star: the smoothed copy of the pupil does not equal the pupil, so some light is left inside the stop. Larger occulters and smaller stops improve rejection at the cost of inner working angle (IWA ≈ $r_m$) and throughput. Sivaramakrishnan et al. (2001) describe the Lyot-plane field in detail.`,
    ],
    formulas: [
      { note: 'Lyot-plane field (M = occulter transmission, L = Lyot stop)', tex: R`E_C=L\cdot\mathcal F^{-1}\{M\,\mathcal F\{E_A\}\},\qquad M(\mathbf u)=0\ \text{for}\ |\mathbf u|<r_m` },
      { note: 'Babinet form used in the simulation', tex: R`E_C=L\cdot\left(E_A-\mathcal F^{-1}\{\chi_{r_m}\mathcal F\{E_A\}\}\right)` },
    ],
    strengths: ['Simple, achromatic occulter.', 'Robust to low-order aberrations such as tip/tilt.'],
    limitations: ['Moderate rejection: no perfect null.', 'Inner working angle at least the occulter radius, typically 3–5 λ/D.', 'Throughput lost to the undersized stop.'],
    instruments: ['Lyot’s solar coronagraph (1930s)', 'HST/ACS coronagraph', 'Keck/NIRC2 occulting spots'],
    refs: ['lyot1939', 'sivaramakrishnan2001', 'soummer2007'],
    sim: 'The occulter is propagated with the Babinet/MFT method of Soummer et al. (2007), with the mask edge averaged over sub-pixels.',
  },
  {
    id: 'aplc', name: 'Apodized pupil Lyot coronagraph (APLC)', family: 'Amplitude mask',
    beginner: 'A Lyot coronagraph with a grey filter in the first pupil that dims the edges of the beam. With the right filter shape, the light that leaks past the spot is a scaled-down copy of the beam, so the Lyot stop can remove almost all of it.',
    expert: [
      R`Soummer (2005) showed that the best apodizer $\Phi$ is an eigenfunction of the operator "pupil → occulter → pupil": $P\,\mathcal F^{-1}\{\chi\,\mathcal F\{\Phi\}\}=\Lambda\Phi$. On axis the Lyot-plane field is then $(1-\Lambda)\Phi$, so the stellar peak is attenuated by $(1-\Lambda)^2$. For a circular pupil $\Phi$ is a generalised prolate spheroidal function; for any other aperture it can be computed numerically.`,
      R`$\Lambda$ approaches 1 as the occulter grows (here $\Lambda>0.9999$ for a 4.7 $\lambda/D$ diameter mask), but the apodizer then becomes more peaked and transmits less light, so real designs trade contrast against throughput.`,
    ],
    formulas: [
      { note: 'eigenvalue problem for the apodizer', tex: R`\Lambda\,\Phi(\mathbf x)=P(\mathbf x)\,\mathcal F^{-1}\{\chi_{r_m}\,\mathcal F\{\Phi\}\}(\mathbf x)` },
      { note: 'on-axis residual in the Lyot plane', tex: R`E_C=(1-\Lambda)\,\Phi` },
    ],
    strengths: ['Deep, achromatic rejection with a hard occulter.', 'Works for obstructed and segmented apertures.'],
    limitations: ['Apodizer throughput falls as the contrast goal rises.', 'IWA set by the occulter (~2–4 λ/D).'],
    instruments: ['Gemini Planet Imager', 'VLT/SPHERE'],
    refs: ['soummer2005', 'soummer2007'],
    sim: 'The apodizer is the leading eigenfunction of the discrete operator, found by Lanczos iterations for the current pupil and mask size.',
  },
  {
    id: 'bandlimited', name: 'Band-limited Lyot coronagraph', family: 'Amplitude mask',
    beginner: 'The spot is replaced by a soft-edged mask whose transmission varies smoothly. Its smoothness guarantees that all the diffracted starlight lands in a thin band at the edges of the next pupil image, where the Lyot stop blocks it completely.',
    expert: [
      R`Kuchner & Traub (2002) required the mask amplitude $m(\mathbf u)=1-\hat w(\mathbf u)$ to be band-limited: the Fourier transform $w$ of $\hat w$ vanishes beyond a width $\epsilon D$. In the Lyot plane the field is $E_A-E_A\ast w$, which is exactly zero wherever the pupil is uniform over a distance $\epsilon D$. A stop eroded by $\epsilon D$ then passes no starlight at all: a perfect null, in the absence of aberrations.`,
      R`Here the mask is the linear sinc² design $m(u)=1-\mathrm{sinc}^2(\pi\epsilon u)$, whose kernel is a triangle of half-width $\epsilon D$. Smaller $\epsilon$ moves the IWA outwards ($\approx0.45/\epsilon$ $\lambda/D$) but keeps more of the pupil.`,
    ],
    formulas: [
      { note: 'linear band-limited mask', tex: R`m(u)=1-\left[\frac{\sin(\pi\epsilon u)}{\pi\epsilon u}\right]^2` },
      { note: 'Lyot-plane field', tex: R`E_C=L\cdot(E_A-E_A\ast w),\qquad w(x)=0\ \text{for}\ |x|>\epsilon D` },
    ],
    strengths: ['Theoretically perfect null for any pupil shape.', 'Well understood analytically.'],
    limitations: ['Mask fixed in physical size: chromatic (the kernel width scales with λ).', 'Lyot stop loses ~2ε of the pupil.', 'Sensitive to low-order aberrations.'],
    instruments: ['JWST/NIRCam coronagraph masks'],
    refs: ['kuchner2002'],
    sim: 'The mask is applied through its exact pupil-plane equivalent (convolution with the triangle kernel), so the monochromatic null is exact on the grid.',
  },
  {
    id: 'shaped', name: 'Shaped pupil coronagraph', family: 'Amplitude mask',
    beginner: 'A black mask with carefully shaped openings is placed over the telescope pupil. The shapes are chosen so that the starlight spreads in a way that leaves deep dark zones on two sides of the star.',
    expert: [
      R`Kasdin et al. (2003) showed that binary (0/1) pupils can do the work of a smooth apodizer. Along the $u$ axis the far field of a pupil open for $|y|\le h(x)$ is the 1D Fourier transform of the opening height $2h(x)$; making $h$ a prolate spheroidal function concentrates the light within $|u|<b$ and leaves the regions beyond $b$ almost dark.`,
      R`Thin openings keep the field dark over a range of $v$ as well: here several stacked openings share the prolate height profile, which widens the dark zones to about ±25° around the $u$ axis.`,
    ],
    formulas: [{ note: 'far field along the axis', tex: R`E(u,0)=\int 2h(x)\,e^{-2\pi i u x}\,dx,\qquad h\propto\psi_0(x)` }],
    strengths: ['Achromatic (pure geometry).', 'No focal-plane mask, so insensitive to pointing.', 'Easy to make as a binary mask.'],
    limitations: ['Dark zones cover only part of the field.', 'Low throughput and wide PSF core.', 'IWA ≈ b (typically 3–4 λ/D).'],
    instruments: ['Nancy Grace Roman Space Telescope Coronagraph Instrument (shaped-pupil modes)'],
    refs: ['kasdin2003'],
    sim: 'Prolate function from a Lanczos eigen-solution; openings rasterised with exact coverage in y. Dark zones lie along ±x.',
  },
  {
    id: 'roddier', name: 'Roddier & Roddier phase mask', family: 'Phase mask',
    beginner: 'A tiny transparent disk in the focal plane delays the centre of the star image by half a wavelength. The delayed light then cancels the rest of the starlight inside the pupil, and the Lyot stop removes what is pushed outside.',
    expert: [R`Roddier & Roddier (1997) chose the disk radius (≈0.53 $\lambda/D$ for a circular pupil) so that the field passing through the disk carries half of the on-axis amplitude. Shifting it by $\pi$ makes the Lyot-plane field $E_A-2\,\mathcal F^{-1}\{\chi\,\mathcal F\{E_A\}\}$, which nearly cancels inside the pupil. The null is partial for an unapodized pupil and the mask is chromatic, but the IWA is small (≈1 $\lambda/D$).`],
    formulas: [{ note: 'π-phase disk', tex: R`E_C=L\cdot\left(E_A-2\,\mathcal F^{-1}\{\chi_{r}\,\mathcal F\{E_A\}\}\right),\quad r\approx0.53\,\lambda/D` }],
    strengths: ['Small inner working angle.', 'High off-axis throughput.'],
    limitations: ['Only a partial null without pupil apodization.', 'Disk size and phase are chromatic.'],
    instruments: ['Laboratory demonstrations; the idea led to the four-quadrant and vortex masks'],
    refs: ['roddier1997'],
    sim: 'Same Babinet/MFT propagation as the Lyot occulter, with (m − 1) = −2 inside the disk.',
  },
  {
    id: 'fqpm', name: 'Four-quadrant phase mask (FQPM)', family: 'Phase mask',
    beginner: 'The focal plane is split into four quarters, two of which delay the light by half a wavelength. For a star exactly on the centre, the four parts of the image cancel each other inside the pupil, and all the starlight ends up outside the Lyot stop.',
    expert: [R`Rouan et al. (2000) proposed $m(u,v)=\mathrm{sign}(u)\,\mathrm{sign}(v)$. For a centred circular pupil the Lyot-plane field vanishes inside the geometric pupil, a perfect null, while an off-axis planet away from the quadrant boundaries passes almost unaffected. Planets near the boundaries are dimmed, and the phase step is chromatic unless made achromatic.`],
    formulas: [{ note: 'mask transmission', tex: R`m(u,v)=\operatorname{sign}(u)\,\operatorname{sign}(v)=e^{i\pi[\,u v<0\,]}` }],
    strengths: ['Perfect null for a circular pupil.', 'Small IWA (~1 λ/D) and high throughput.'],
    limitations: ['Dead zones along the quadrant boundaries.', 'Chromatic π step.', 'Sensitive to tip/tilt and central obstruction.'],
    instruments: ['JWST/MIRI', 'VLT/NACO', 'VLT/SPHERE'],
    refs: ['rouan2000'],
    sim: 'Multi-scale propagation (FFT plus finer MFT levels); throughput is measured at 45°, away from the boundaries.',
  },
  {
    id: 'vortex', name: 'Vortex coronagraph', family: 'Phase mask',
    beginner: 'A focal-plane mask whose phase winds around the centre like a spiral staircase. For an on-axis star it throws all the light outside the pupil, where the Lyot stop blocks it, while light from a planet a little off-centre passes through.',
    expert: [
      R`The mask is $e^{il\theta}$ with an even topological charge $l$ (Mawet et al. 2005; Foo et al. 2005). For a circular pupil, the Lyot-plane field of an on-axis source is zero inside the pupil and falls as $(R/r)^{l}$ outside it, so a stop slightly smaller than the pupil gives a perfect null. Higher charges reject more low-order aberrations (tip/tilt, defocus) but move the IWA outward (about 1, 2 and 3 $\lambda/D$ for $l=2,4,6$ here).`,
      R`Achromatic versions use a geometric phase (subwavelength gratings, liquid-crystal polymers), such as the annular groove phase mask and the vector vortex (Mawet et al. 2010).`,
    ],
    formulas: [
      { note: 'mask', tex: R`m(\rho,\theta)=e^{\,i\,l\,\theta},\qquad l=2,4,6` },
      { note: 'charge 2, uniform circular pupil of radius a (Lyot-plane amplitude)', tex: R`|E_C(r)|=\begin{cases}0,&r<a\\ (a/r)^2,&r>a\end{cases}` },
    ],
    strengths: ['Perfect null and small IWA.', 'High throughput, full 360° field.', 'Achromatic implementations.'],
    limitations: ['Null degraded by central obstructions and spiders.', 'Sensitive to tip/tilt (charge 2).'],
    instruments: ['Keck/NIRC2', 'VLT/NACO and VISIR (AGPM)', 'Palomar Hale (vector vortex)'],
    refs: ['mawet2005', 'foo2005', 'mawet2010'],
    sim: 'Multi-scale propagation with the singular point between samples; the null floor (~1e-8) is set by the sampling.',
  },
  {
    id: 'app', name: 'Apodizing phase plate (APP / vAPP)', family: 'Phase mask (pupil plane)',
    beginner: 'A transparent plate in the pupil that only changes the phase of the light. The pattern is designed so that the starlight moves out of a D-shaped region on one side of the star, leaving a dark hole there. The vector version makes two images with dark holes on opposite sides.',
    expert: [
      R`Codona & Angel (2004) showed that a phase-only pupil $P\,e^{i\phi}$ can push the diffraction pattern out of a chosen region; the first on-sky plate (Kenworthy et al. 2007) cleared 2–9 $\lambda/D$ over 180°. Because $\mathcal F\{P e^{-i\phi}\}(\mathbf u)=\overline{\mathcal F\{P e^{i\phi}\}(-\mathbf u)}$ for a symmetric pupil, the conjugate phase gives the mirrored dark hole.`,
      R`The vector APP writes $\phi$ as a geometric phase in a liquid-crystal layer: the two circular polarisations receive $+\phi$ and $-\phi$, independent of wavelength. Polarisation leakage adds a faint copy of the normal PSF (Otten et al. 2017).`,
    ],
    formulas: [
      { note: 'phase-only pupil', tex: R`E_A=P\,e^{\pm i\phi(\mathbf x)},\quad \phi\ \text{chosen so that}\ |\mathcal F\{E_A\}|^2\approx0\ \text{in the hole}` },
    ],
    strengths: ['No focal-plane mask: insensitive to pointing and vibrations.', 'Works on any aperture.', 'vAPP is achromatic.'],
    limitations: ['Dark hole on one side only (per channel).', 'Part of the light leaves the core (lower Strehl).', 'Classical APP is chromatic.'],
    instruments: ['MMT (first APP)', 'VLT/NACO', 'Magellan MagAO/Clio2 (vAPP)', 'LBT/LMIRCam'],
    refs: ['codona2004', 'kenworthy2007', 'otten2017'],
    sim: 'Phase found with a Gerchberg–Saxton iteration on a q = 2 grid; the image is normalised to the APP core peak.',
  },
]
