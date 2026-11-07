/* Explanations for the telescope PSF simulation: tooltips, and theory, formulas and references per parameter.
   Rendered by ../shared/explain.js. Strings with backslashes use String.raw so that the TeX is written as is. */
window.SIM_HELP = (() => {
  const R = String.raw;
  const ads = (code) => 'https://ui.adsabs.harvard.edu/abs/' + code.replace(/&/g, '%26');

  const BORNWOLF = { c: 'Born, M. & Wolf, E. 1999, Principles of Optics, 7th ed., Cambridge University Press (chapter 8, Fraunhofer diffraction: circular and annular apertures)' };
  const BORNWOLF_Z = { c: 'Born, M. & Wolf, E. 1999, Principles of Optics, 7th ed., Cambridge University Press (appendix VII, the Zernike polynomials)' };
  const GOODMAN = { c: 'Goodman, J. W. 2017, Introduction to Fourier Optics, 4th ed., W. H. Freeman' };
  const AIRY = { c: 'Airy, G. B. 1835, Trans. Cambridge Philos. Soc. 5, 283, "On the diffraction of an object-glass with circular aperture"' };
  const RAYLEIGH = { c: 'Rayleigh, Lord 1879, Phil. Mag. 8, 261, "Investigations in optics, with special reference to the spectroscope"' };
  const COOLEY = { c: 'Cooley, J. W. & Tukey, J. W. 1965, Math. Comput. 19, 297, "An algorithm for the machine calculation of complex Fourier series"', u: 'https://doi.org/10.1090/S0025-5718-1965-0178586-1' };
  const STREHL = { c: 'Strehl, K. 1895, Z. Instrumentenkd. 15, 362, "Aplanatische und fehlerhafte Abbildung im Fernrohr"' };
  const MARECHAL = { c: "Maréchal, A. 1947, Rev. Opt. 26, 257, \"Étude des effets combinés de la diffraction et des aberrations géométriques sur l'image d'un point lumineux\"" };
  const MAHAJAN = { c: 'Mahajan, V. N. 1983, J. Opt. Soc. Am. 73, 860, "Strehl ratio for primary aberrations in terms of their aberration variance"', u: ads('1983JOSA...73..860M') };
  const ZERNIKE = { c: 'Zernike, F. 1934, Physica 1, 689, "Beugungstheorie des Schneidenverfahrens und seiner verbesserten Form, der Phasenkontrastmethode"' };
  const NOLL = { c: 'Noll, R. J. 1976, J. Opt. Soc. Am. 66, 207, "Zernike polynomials and atmospheric turbulence"', u: ads('1976JOSA...66..207N') };
  const HARVEY = { c: 'Harvey, J. E. & Ftaclas, C. 1995, Appl. Opt. 34, 6337, "Diffraction effects of telescope secondary mirror spiders on various image-quality criteria"', u: 'https://doi.org/10.1364/AO.34.006337' };
  const GARDNER = { c: 'Gardner, J. P. et al. 2006, Space Sci. Rev. 123, 485, "The James Webb Space Telescope"', u: ads('2006SSRv..123..485G') };
  const PERRIN = { c: 'Perrin, M. D. et al. 2012, Proc. SPIE 8442, 84423D, "Simulating point spread functions for the James Webb Space Telescope with WebbPSF"' };
  const CHANAN = { c: 'Chanan, G., Troy, M., Dekens, F., Michaels, S., Nelson, J., Mast, T. & Kirkman, D. 1998, Appl. Opt. 37, 140, "Phasing the mirror segments of the Keck telescopes: the broadband phasing algorithm"', u: 'https://doi.org/10.1364/AO.37.000140' };

  const tips = {
    D: 'Diameter of the primary mirror. A bigger mirror gives a smaller, sharper star image.',
    lam: 'Center wavelength of the light. Longer wavelengths give a larger pattern.',
    band: 'Width of the band of wavelengths added together. Zero means one wavelength.',
    'seg-on': 'Build the primary mirror from hexagonal segments instead of one solid disk.',
    'preset-jwst': 'Layout of the James Webb Space Telescope: 18 segments, empty center, D = 6.5 m.',
    'preset-keck': 'Layout of a Keck telescope: 36 segments, empty center, D = 10 m.',
    'preset-91': 'A mirror of 5 rings and 91 segments, with D = 30 m.',
    'seg-rings': 'Number of hexagonal rings around the center segment.',
    'seg-gap': 'Width of the empty strip between segments, as a fraction of the segment width.',
    'seg-center': 'Leave the center of the mirror empty, as on JWST and Keck.',
    'seg-piston': 'Random shift of each segment along the optical axis, as RMS wavefront error.',
    'seg-tilt': 'Random tilt of each segment, as RMS wavefront change at the segment edge.',
    'seg-draw': 'Draw a new random set of segment errors with the same RMS.',
    eps: 'Diameter of the secondary mirror as a fraction of D. It blocks light in the middle.',
    nvane: 'Number of struts holding the secondary mirror.',
    tvane: 'Width of each strut as a fraction of D.',
    avane: 'Rotation of the whole set of struts.',
    'z-defocus': 'Focus error. It spreads the core and fills the dark rings.',
    'z-ast0': 'Astigmatism along the horizontal and vertical axes.',
    'z-ast45': 'Astigmatism along the two diagonals.',
    'z-comax': 'Coma with the tail along x: a comet-shaped star.',
    'z-comay': 'Coma with the tail along y.',
    'z-sph': 'Spherical aberration: a bright core inside a halo.',
    'clear-zern': 'Set every Zernike coefficient to zero.',
    fov: 'Full width of the picture, in arcseconds.',
    range: 'Number of factors of 10 of brightness shown below the peak.',
    cmap: 'How brightness is turned into colour.',
    showring: 'Draw a circle at the first dark ring of a clear circular telescope, 1.22 λ/D.',
    reset: 'Restore every parameter to its default value.',
    'read-ld': 'The diffraction angle of the telescope: wavelength divided by diameter.',
    'read-airy': 'Radius of the first dark ring: 1.22 λ/D.',
    'read-area': 'Open area of the mirror compared with a full circle of diameter D.',
    'read-strehl': 'Peak of the image compared with a perfect telescope of the same aperture.',
    'read-rms': 'Root-mean-square error of the wavefront over the open mirror, in waves.',
    'read-marechal': 'Estimate of the Strehl ratio from the wavefront error alone.',
    'read-peak': 'Peak brightness compared with a clear circular mirror of the same diameter.',
    'read-segs': 'Number of hexagonal segments in the mirror.',
    'read-samples': 'Number of wavelengths added together.',
    'read-time': 'Time taken to compute the last image.'
  };

  const bind = {
    D: 'D', lam: 'lam', band: 'band', 'seg-rings': 'segrings', 'seg-gap': 'seggap', 'seg-piston': 'segpiston', 'seg-tilt': 'segtilt',
    eps: 'eps', nvane: 'vanes', tvane: 'vanes', avane: 'vanes',
    'z-defocus': 'defocus', 'z-ast0': 'astig', 'z-ast45': 'astig', 'z-comax': 'coma', 'z-comay': 'coma', 'z-sph': 'spherical',
    fov: 'fov', range: 'range', cmap: 'cmap'
  };
  const panels = { 't-psf': 'psf', 't-pupil': 'pupil', 't-profile': 'profile', 't-seg': 'seg' };

  const topics = {
    basics: {
      title: 'Basics: how to read this simulation',
      what: 'A star is so far away that it is a point of light, but a telescope cannot image it as a point. Light is a wave, so the image is a small pattern with a bright core, faint rings and sometimes spikes. That pattern is the point spread function (PSF), and it decides how sharp a telescope can be.',
      theory: [
        R`In the far field, the light in the focal plane is the Fourier transform of the light across the aperture. The aperture function $A$ is 1 where the mirror reflects and 0 where it is blocked, and the wavefront error $W$ (in waves) adds a phase. The PSF is the squared modulus of that transform, which the program computes with a fast Fourier transform (FFT).`,
        R`Angles are shown in arcseconds, but the natural unit of the pattern is $\lambda/D$: the angle set by the wavelength $\lambda$ and the mirror diameter $D$. A bigger mirror or a shorter wavelength shrinks the whole pattern.`,
        R`The controls come in groups: the {{D|mirror}} and the {{lam|wavelength}}; an optional {{seg|segmented mirror}}; the {{eps|central obstruction}} and {{vanes|spider vanes}} that block light; the {{zernike|Zernike aberrations}} that bend the wavefront; and the display settings ({{fov|field of view}}, {{range|dynamic range}}, {{cmap|colours}}). Click any parameter name for its theory, or hover over it for a short description.`
      ],
      formulas: [
        { note: 'what the simulation computes', tex: R`{\rm PSF}(\boldsymbol\theta)=\left|\mathcal F\left\{A(\mathbf x)\,e^{\,i\,2\pi W(\mathbf x)}\right\}\right|^{2}` },
        { note: 'the angular unit of the pattern', tex: R`\frac{\lambda}{D}\,[{\rm arcsec}]=\frac{\lambda\,[{\rm m}]}{D\,[{\rm m}]}\times 206\,265` }
      ],
      sim: R`The image is computed on a grid of 512 × 512 points; see {{numerics|the numerical method and its limits}}.`,
      refs: [GOODMAN, BORNWOLF],
      see: ['psf', 'airy', 'strehl', 'pupil', 'profile', 'numerics']
    },

    psf: {
      title: 'Image of the star, PSF and Strehl ratio',
      what: 'The point spread function (PSF) is the image that the telescope makes of a point-like star. It is shown on a logarithmic scale and normalised to the peak of a perfect telescope with the same aperture.',
      theory: [
        R`The PSF is the squared modulus of the Fourier transform of the pupil field: the aperture $A$ multiplied by the phase from the wavefront error $W$. A clear circular mirror gives the {{airy|Airy pattern}}. Blocked light (an {{eps|obstruction}}, {{vanes|spider vanes}}, the gaps and outline of a {{seg|segmented mirror}}) adds spikes and moves energy into the rings. {{zernike|Aberrations}} fill in the dark rings and distort the core.`,
        R`The image is divided by $\left(\sum A\right)^2$, the peak of a perfect image of the same aperture. The peak of the result is then the {{strehl|Strehl ratio}}, and a perfect telescope has a peak of exactly 1 whatever the shape of its aperture.`
      ],
      formulas: [
        { tex: R`{\rm PSF}(\boldsymbol\theta)=\left|\mathcal F\left\{A\,e^{\,i\,2\pi W}\right\}\right|^{2}` },
        { note: 'normalisation, $A$ summed over the pupil grid', tex: R`\widehat{\rm PSF}=\frac{\left|{\rm FFT}(A\,e^{\,i\,2\pi W})\right|^{2}}{\left(\sum A\right)^{2}}` },
        { note: 'the peak of a perfect image is the squared sum of the aperture', tex: R`\max\,\widehat{\rm PSF}_{W=0}=1` }
      ],
      sim: R`The pupil is 128 pixels wide in a grid of 512 × 512, which gives four samples per $\lambda/D$ and a computed field of $\pm 64\,\lambda/D$. The picture is resampled to the field of view you choose, in arcseconds.`,
      refs: [GOODMAN, BORNWOLF, COOLEY],
      see: ['airy', 'pupil', 'strehl', 'range', 'numerics']
    },

    airy: {
      title: 'The Airy pattern and the diffraction limit',
      what: 'A clear circular mirror of diameter D images a star as a bright core (the Airy disk) surrounded by rings that get fainter outward. The first dark ring sets the resolution: two equal stars closer than this angle blur into one.',
      theory: [
        R`Airy (1835) solved the diffraction of light by a circular aperture. In units of $x=\pi D\theta/\lambda$ the intensity is $[2J_1(x)/x]^2$, with $J_1$ the Bessel function of the first kind. It first vanishes where $J_1(x)=0$, at $x=3.8317$, which is $\theta=1.22\,\lambda/D$. Rayleigh (1879) proposed that two stars are just resolved when the peak of one falls on the first dark ring of the other.`,
        R`The pattern is not a sharp-edged disk: the first bright ring has only 1.75 % of the peak intensity, the next 0.42 %, then 0.16 %. About 84 % of the light falls inside the first dark ring. On the log scale of the picture these faint rings are easy to see.`
      ],
      formulas: [
        { note: 'Airy pattern, normalised to the peak', tex: R`I(\theta)=\left[\frac{2J_1(x)}{x}\right]^{2},\qquad x=\frac{\pi D\theta}{\lambda}` },
        { note: 'first dark ring (Rayleigh criterion)', tex: R`\theta_1=\frac{3.8317}{\pi}\,\frac{\lambda}{D}=1.22\,\frac{\lambda}{D}` },
        { note: R`fraction of the light inside angle $\theta$`, tex: R`{\rm EE}(\theta)=1-J_0^{2}(x)-J_1^{2}(x),\qquad {\rm EE}(\theta_1)=0.838` }
      ],
      sim: R`Tick "Mark the first dark ring" to draw a circle of radius $1.22\,\lambda/D$ on the picture. The dashed curve of the radial profile is this pattern for a clear circular telescope of the same diameter and band.`,
      refs: [AIRY, RAYLEIGH, BORNWOLF],
      see: ['D', 'lam', 'eps', 'profile', 'ld']
    },

    ld: {
      title: 'The angular unit λ/D',
      what: 'λ/D is the diffraction angle of the telescope: the wavelength divided by the mirror diameter. Distances in the pattern are usually quoted in this unit because the whole pattern scales with it.',
      theory: [
        R`The ratio $\lambda/D$ is an angle in radians, converted to arcseconds with $1\ {\rm rad}=206\,265''$. For $D=1$ m and $\lambda=550$ nm it is $0.113''$. Doubling the diameter, or halving the wavelength, halves it.`,
        R`The picture has a fixed width in arcseconds, so its width in units of $\lambda/D$ is the field of view divided by $\lambda/D$. This is how a bigger mirror makes the pattern look smaller on the screen.`
      ],
      formulas: [
        { tex: R`\frac{\lambda}{D}\,[{\rm arcsec}]=\frac{\lambda\,[{\rm m}]}{D\,[{\rm m}]}\times 206\,265` },
        { note: R`half of the field of view, in units of $\lambda/D$`, tex: R`h=\frac{{\rm FOV}/2}{\lambda/D}` }
      ],
      refs: [BORNWOLF],
      see: ['D', 'lam', 'fov', 'airy']
    },

    D: {
      title: 'Mirror diameter D',
      what: 'The diameter of the primary mirror. For a segmented mirror it is the diameter of the circle that just encloses all the segments. It sets the diffraction limit λ/D and the light-collecting area.',
      theory: [
        R`The smaller the angle $\lambda/D$, the sharper the image: the resolution improves in proportion to the diameter. The light-gathering power grows as $D^2$, so a bigger mirror both sees finer detail and collects more photons.`,
        R`For a ground-based telescope the atmosphere usually blurs the image far more than diffraction does. Adaptive optics (see the adaptive optics simulation) brings it back toward the diffraction limit. This simulation has no atmosphere.`
      ],
      formulas: [
        { note: 'angular resolution (Rayleigh criterion)', tex: R`\theta=1.22\,\frac{\lambda}{D}` },
        { note: 'collecting area of a circular mirror', tex: R`A=\frac{\pi D^{2}}{4}` }
      ],
      sim: R`The field of view is fixed in arcseconds, so changing $D$ rescales the pattern on the screen. The presets of the {{segpresets|segmented mirror}} set $D$ for you.`,
      refs: [BORNWOLF],
      see: ['airy', 'lam', 'ld', 'seg']
    },

    lam: {
      title: 'Center wavelength λ',
      what: 'The center wavelength of the light. The whole diffraction pattern scales in proportion to it: red light gives a larger star image than blue light in the same telescope.',
      theory: [
        R`The diffraction angle is $\lambda/D$, so longer wavelengths give a wider core and wider rings. Visible light covers about 380 to 750 nm: blue is near 450 nm, green near 550 nm and red near 650 nm.`,
        R`The {{zernike|Zernike}} and {{segpiston|segment}} errors are entered in waves at this wavelength. A geometric error is a fixed length, so in waves it scales as $1/\lambda$; this matters for a {{band|wide band}}.`
      ],
      formulas: [
        { note: 'size of the pattern', tex: R`\theta_1=1.22\,\frac{\lambda}{D}\ \propto\ \lambda` },
        { note: 'a geometric error in waves, at another wavelength', tex: R`c(\lambda)=c(\lambda_0)\,\frac{\lambda_0}{\lambda}` }
      ],
      refs: [BORNWOLF],
      see: ['band', 'D', 'ld', 'zernike']
    },

    band: {
      title: 'Bandwidth Δλ',
      what: 'The width of a flat band of wavelengths centred on λ. Zero means light of a single wavelength. A wider band adds the images of seven wavelengths, so the rings of different colours blur together.',
      theory: [
        R`Each wavelength has its own pattern, scaled by $\lambda$. At one angle $\theta$ the rings of different wavelengths do not line up, so their sum has weaker contrast: the dark rings fill in and the rings fade. The outer rings, where the shift between wavelengths is largest, fade first.`,
        R`Every sample keeps the same aberrations in length, so in waves they scale as $1/\lambda$. Without aberrations all the samples share one pattern in units of $\lambda/D$, so the sum is fast to compute; with aberrations each wavelength needs its own FFT.`
      ],
      formulas: [
        { note: 'seven equal-weight samples across the band', tex: R`I_{\rm band}(\theta)=\sum_{i=1}^{7}w_i\,I(\theta;\lambda_i),\qquad w_i=\tfrac{1}{7}` },
        { tex: R`\lambda_i=\lambda-\frac{\Delta\lambda}{2}+\left(i-\tfrac12\right)\frac{\Delta\lambda}{7}` },
        { note: 'geometric errors, in waves', tex: R`c(\lambda_i)=c(\lambda)\,\frac{\lambda}{\lambda_i}` }
      ],
      sim: R`The colour map "Wavelength color" tints each sample with its own hue. With seven samples, the widest bands can leave faint ghost rings beyond about the twelfth ring.`,
      refs: [GOODMAN],
      see: ['lam', 'airy', 'zernike', 'cmap']
    },

    eps: {
      title: 'Central obstruction ε',
      what: 'The diameter of the secondary mirror (or any central blockage) as a fraction of D. It removes light from the middle of the pupil, which moves energy from the bright core into the diffraction rings.',
      theory: [
        R`The aperture is an annulus. Its pattern is the Airy pattern of the full circle minus that of the blocked circle, scaled to the same peak. The blocked circle has a narrower aperture, so its pattern is wider and its subtraction makes the first dark ring move slightly inward, while the rings get brighter.`,
        R`The light lost is the blocked area, a fraction $\epsilon^2$ of the full circle. Since the peak of an image grows as the square of the collecting area, the peak falls as $(1-\epsilon^2)^2$.`
      ],
      formulas: [
        { note: 'obstruction ratio', tex: R`\epsilon=\frac{d_{\rm secondary}}{D}` },
        { note: 'open area and peak intensity compared with a clear circle', tex: R`\frac{A_{\rm open}}{A_{\rm circle}}=1-\epsilon^{2},\qquad \frac{I_{\rm peak}}{I_{\rm peak}^{\rm clear}}=(1-\epsilon^{2})^{2}` },
        { note: R`annular aperture, normalised to its own peak, $x=\pi D\theta/\lambda$`, tex: R`I(x)=\frac{1}{(1-\epsilon^{2})^{2}}\left[\frac{2J_1(x)}{x}-\epsilon^{2}\,\frac{2J_1(\epsilon x)}{\epsilon x}\right]^{2}` }
      ],
      sim: R`The obstruction acts together with the {{vanes|spider vanes}} and on top of a {{seg|segmented mirror}}. The readout "Peak vs. clear circle" shows the $(1-\epsilon^2)^2$ loss.`,
      refs: [BORNWOLF],
      see: ['airy', 'vanes', 'area', 'relpeak']
    },

    vanes: {
      title: 'Spider vanes',
      what: 'The struts that hold the secondary mirror. Each vane is a thin opaque strip, and a strip diffracts light into a bright spike perpendicular to it. You control the number, the width and the rotation of the vanes.',
      theory: [
        R`The pattern of a thin strip of length $L$ and width $t$ is the product of two $\sin u/u$ functions. It is narrow along the direction of the strip (width about $\lambda/L$) and wide along the perpendicular (about $\lambda/t$), which draws a long thin spike perpendicular to the vane. Thinner vanes give fainter spikes that reach further out.`,
        R`Vanes opposite each other make one straight line. An even number $N$ of vanes gives $N/2$ lines and so $N$ spikes. An odd number gives $N$ lines, so $2N$ spikes. Rotating the vanes rotates the spikes with them.`
      ],
      formulas: [
        { note: R`one vane along $x$, with length $L$ and width $t$ ($\mathrm{sinc}\,u=\sin u/u$)`, tex: R`\tilde A(\theta_x,\theta_y)\propto t\,L\ \mathrm{sinc}\!\left(\frac{\pi L\theta_x}{\lambda}\right)\mathrm{sinc}\!\left(\frac{\pi t\theta_y}{\lambda}\right)` },
        { note: 'number of spikes', tex: R`N_{\rm spikes}=\begin{cases}N & N\ \text{even}\\ 2N & N\ \text{odd}\end{cases}` },
        { note: 'direction of vane $j$', tex: R`\varphi_j=\varphi_0+\frac{360^{\circ}\,j}{N}` },
        { note: R`area blocked, with $L\approx\frac{D}{2}(1-\epsilon)$`, tex: R`\Delta A\approx N\,t\,D\ \frac{D}{2}\,(1-\epsilon)` }
      ],
      sim: R`The vanes start at the center and reach the edge of the mirror, so they also cross the {{eps|central obstruction}}. On a {{seg|segmented mirror}} they cross the segments.`,
      refs: [HARVEY, BORNWOLF],
      see: ['eps', 'airy', 'seg']
    },

    zernike: {
      title: 'Zernike aberrations',
      what: 'Real mirrors are never perfect. The wavefront error W says how far the real wave is from an ideal one, in waves. It is described as a sum of Zernike modes: simple shapes such as focus, astigmatism and coma, each scaled so that its coefficient is its RMS size in waves.',
      theory: [
        R`The Zernike polynomials $Z_k(\rho,\theta)$ are orthogonal over the unit disk, with $\rho=r/R$ the radius in units of the mirror radius. The Noll normalisation used here gives each polynomial zero mean and unit RMS, so the coefficient $c_k$ is the RMS wavefront error of that mode, and the total RMS error is the root of the sum of the squares.`,
        R`The phase added to the light is $2\pi W$. A small total error $\sigma$ lowers the {{strehl|Strehl ratio}} by about $(2\pi\sigma)^2$; see also the {{wavefront|wavefront error}}. The modes here are {{defocus|defocus}}, {{astig|astigmatism}}, {{coma|coma}} and {{spherical|spherical aberration}}.`
      ],
      formulas: [
        { tex: R`W(\rho,\theta)=\sum_k c_k\,Z_k(\rho,\theta),\qquad \phi=2\pi W` },
        { note: 'orthonormal over the unit disk (Noll)', tex: R`\frac{1}{\pi}\int_0^{2\pi}\!\!\int_0^1 Z_j Z_k\,\rho\,d\rho\,d\theta=\delta_{jk}` },
        { note: 'total RMS error', tex: R`\sigma^{2}=\sum_k c_k^{2}` }
      ],
      sim: R`Coefficients are given at the {{lam|center wavelength}}. $\rho$ is measured from the center of the pupil in units of the radius of the circle that encloses the mirror.`,
      refs: [ZERNIKE, NOLL, MAHAJAN, BORNWOLF_Z],
      see: ['defocus', 'astig', 'coma', 'spherical', 'strehl', 'wavefront']
    },

    defocus: {
      title: 'Defocus (Z4)',
      what: 'Focus error: the detector sits slightly in front of or behind the best focus. The core widens symmetrically and light moves into the rings.',
      theory: [
        R`Defocus is a wavefront that is a paraboloid, $\rho^2$. After removing the average (piston) it is the Zernike mode $Z_4$. The star image is the same whether the detector is in front of or behind the focus, so a positive and a negative coefficient give identical pictures; only the colours of the pupil view swap.`,
        R`A focus shift $\Delta z$ at focal ratio $F$ gives a peak wavefront error $W_{020}=\Delta z/(8F^2)$ at the edge of the pupil, and $c_4=W_{020}/(2\sqrt3)$ RMS.`
      ],
      formulas: [
        { tex: R`Z_4=\sqrt{3}\,(2\rho^{2}-1)` },
        { note: R`focus shift $\Delta z$ at focal ratio $F$`, tex: R`W_{020}=\frac{\Delta z}{8F^{2}},\qquad c_4=\frac{W_{020}}{2\sqrt3}` },
        { tex: R`S\approx\exp\left[-(2\pi c_4)^{2}\right]` }
      ],
      refs: [NOLL, MAHAJAN, BORNWOLF_Z],
      see: ['zernike', 'strehl', 'spherical']
    },

    astig: {
      title: 'Astigmatism (Z5 and Z6)',
      what: 'The mirror is more strongly curved along one axis than the other. A star is stretched along one direction on one side of focus and along the perpendicular direction on the other side.',
      theory: [
        R`Astigmatism has two components, $Z_6$ along the horizontal and vertical axes and $Z_5$ along the diagonals. Together they describe an astigmatism of any amplitude and orientation. Changing the sign of one component rotates the pattern by 90°.`,
        R`In the picture the core is elongated, and the rings fill in along one axis.`
      ],
      formulas: [
        { tex: R`Z_6=\sqrt{6}\,\rho^{2}\cos 2\theta,\qquad Z_5=\sqrt{6}\,\rho^{2}\sin 2\theta` },
        { note: 'amplitude and orientation of the combined astigmatism', tex: R`c=\sqrt{c_5^{2}+c_6^{2}},\qquad \alpha=\tfrac12\,{\rm atan2}(c_5,c_6)` }
      ],
      refs: [NOLL, MAHAJAN, BORNWOLF_Z],
      see: ['zernike', 'coma', 'strehl']
    },

    coma: {
      title: 'Coma (Z7 and Z8)',
      what: 'Caused by misaligned or off-axis optics. The star becomes comet-shaped, with a tail along one direction: one side of the core is sharp and bright and the other side is smeared.',
      theory: [
        R`Coma is a wavefront with a cubic term in $\rho$. The mode used here also contains the tilt that moves the image back to the center, so the core stays near the middle and only the shape changes. Unlike defocus and astigmatism, the pattern is not symmetric about its center.`,
        R`It has two components: $Z_8$ puts the tail along $x$ and $Z_7$ along $y$.`
      ],
      formulas: [
        { tex: R`Z_8=\sqrt{8}\,(3\rho^{3}-2\rho)\cos\theta,\qquad Z_7=\sqrt{8}\,(3\rho^{3}-2\rho)\sin\theta` },
        { note: 'Strehl ratio for a small error', tex: R`S\approx\exp\left[-(2\pi c)^{2}\right]` }
      ],
      refs: [NOLL, MAHAJAN, BORNWOLF_Z],
      see: ['zernike', 'astig', 'strehl']
    },

    spherical: {
      title: 'Spherical aberration (Z11)',
      what: 'Rays from the center and from the edge of the pupil focus at different distances. The star gets a bright core inside a halo, and the dark rings fill in. The pattern stays circular.',
      theory: [
        R`Spherical aberration is a wavefront that varies as $\rho^4$. The Zernike mode $Z_{11}$ removes the part of it that is only a change of focus and piston, so the coefficient measures what cannot be undone by refocusing. It is the aberration that a mirror of the wrong conic shape has.`
      ],
      formulas: [
        { tex: R`Z_{11}=\sqrt{5}\,(6\rho^{4}-6\rho^{2}+1)` },
        { tex: R`S\approx\exp\left[-(2\pi c_{11})^{2}\right]` }
      ],
      refs: [NOLL, MAHAJAN, BORNWOLF_Z],
      see: ['zernike', 'defocus', 'strehl']
    },

    strehl: {
      title: 'Strehl ratio and the Maréchal approximation',
      what: 'The Strehl ratio S is the peak brightness of the real star image divided by the peak of a perfect image of the same aperture. It is 1 for a perfect telescope and falls as aberrations grow. Above 0.8 a telescope is called diffraction limited.',
      theory: [
        R`For small errors the Strehl ratio depends only on the RMS wavefront error $\sigma$, not on the shape of the error. Maréchal gave $S\approx1-(2\pi\sigma)^2$, and the form $S\approx e^{-(2\pi\sigma)^2}$ (Mahajan 1983) stays accurate for larger errors. The criterion $S\geq0.8$ corresponds to $\sigma\approx0.075$ wave, about $\lambda/13$.`,
        R`The approximation fails for large errors, where the peak is no longer at the center and the light spreads into a halo. Compare the simulated Strehl ratio with the Maréchal value in the readouts to see where it stops working.`
      ],
      formulas: [
        { tex: R`S=\frac{I_{\rm peak}}{I_{\rm peak}^{\rm ideal}}` },
        { note: R`Maréchal approximation, $\sigma$ in waves`, tex: R`S\approx\exp\left[-(2\pi\sigma)^{2}\right]\approx 1-(2\pi\sigma)^{2}` },
        { note: 'the usual criterion', tex: R`\sigma=\frac{\lambda}{14}\ \Rightarrow\ S\approx 0.82` }
      ],
      refs: [STREHL, MARECHAL, MAHAJAN, BORNWOLF],
      see: ['wavefront', 'zernike', 'segpiston']
    },

    wavefront: {
      title: 'Wavefront error (RMS)',
      what: 'The root-mean-square deviation of the wavefront from a perfect flat wave, over the open part of the mirror, in waves. The average (piston) is removed because a uniform shift changes nothing in the image.',
      theory: [
        R`It adds the {{zernike|Zernike modes}} and, for a segmented mirror, the random {{segpiston|piston}} and {{segtilt|tilt}} of the segments, all measured over the area that really transmits light, so a central obstruction or spider vanes change the value slightly.`,
        R`For a mirror, a surface error changes the path of the light twice, so the wavefront error is twice the surface error at normal incidence.`
      ],
      formulas: [
        { tex: R`\sigma=\sqrt{\langle W^{2}\rangle-\langle W\rangle^{2}}\quad\text{(average over the open mirror)}` },
        { note: 'reflection at normal incidence', tex: R`\sigma_{\rm wavefront}=2\,\sigma_{\rm surface}` }
      ],
      refs: [MAHAJAN, BORNWOLF_Z],
      see: ['strehl', 'zernike', 'pupil']
    },

    pupil: {
      title: 'Pupil and wavefront',
      what: 'The aperture as the star sees it. Brightness is the transmission (black means blocked) and colour is the wavefront error: blue negative, orange positive, white zero.',
      theory: [
        R`This is the function that the Fourier transform acts on: $A\,e^{i2\pi W}$. The shape of the black parts (central obstruction, spider vanes, the gaps and the outline of the segments) decides the shape of the diffraction pattern, and the colours decide how the light is redistributed.`,
        R`The colour scale is the smallest of $\pm0.05$, $\pm0.1$, $\pm0.25$, $\pm0.5$ and $\pm1$ wave that holds the whole wavefront, and it is printed under the picture. On a {{seg|segmented mirror}} each segment shows its piston as a flat colour and its tilt as a gradient.`
      ],
      formulas: [
        { tex: R`U(x,y)=A(x,y)\,e^{\,i\,2\pi W(x,y)}` }
      ],
      see: ['wavefront', 'zernike', 'seg', 'psf']
    },

    profile: {
      title: 'Radial profile',
      what: 'The brightness of the star image averaged around circles centred on the star, plotted against the angular distance. It is compared with the ideal Airy pattern of a clear circular telescope of the same diameter and band.',
      theory: [
        R`Averaging around the star turns the two-dimensional image into one curve and smooths out spikes, so it shows the rings and the halo. Obstructions raise the rings above the dashed Airy curve, and aberrations fill in the dark rings between them. A wide band smooths the rings.`,
        R`The picture has four samples per $\lambda/D$, so the profile is interpolated. The interpolation lifts the deepest dark rings slightly above theory, so use the plot to compare shapes, not to measure how deep a dark ring is.`
      ],
      formulas: [
        { tex: R`I(\theta)=\frac{1}{2\pi}\int_0^{2\pi}{\rm PSF}(\theta,\varphi)\,d\varphi` },
        { note: 'ideal reference', tex: R`I_{\rm Airy}(\theta)=\left[\frac{2J_1(x)}{x}\right]^{2},\qquad x=\frac{\pi D\theta}{\lambda}` }
      ],
      refs: [BORNWOLF],
      see: ['airy', 'psf', 'range']
    },

    fov: {
      title: 'Field of view',
      what: 'The full width of the picture, in arcseconds. Zoom in to see the core, zoom out to see the rings and spikes.',
      theory: [
        R`The pattern is computed in units of $\lambda/D$ and then resampled to this width, so the picture changes size when you change the {{D|diameter}} or the {{lam|wavelength}}. The computation covers $\pm64\,\lambda/D$. If the field of view asks for more, the outside is black and a warning appears.`
      ],
      formulas: [
        { note: R`half of the field, in units of $\lambda/D$`, tex: R`h=\frac{{\rm FOV}/2}{\lambda/D}\ \le\ 64` },
        { tex: R`1''=4.848\times10^{-6}\ {\rm rad}` }
      ],
      see: ['ld', 'D', 'lam', 'numerics']
    },

    range: {
      title: 'Dynamic range and the log scale',
      what: 'The number of decades (factors of 10) of brightness shown below the peak. White is the peak of a perfect image and black is 10⁻ᴿ of it, with R the dynamic range.',
      theory: [
        R`The rings of the pattern are hundreds to millions of times fainter than the core, so a linear scale would show only the core. A logarithmic scale gives each factor of ten the same range of brightness. Raise the dynamic range to reveal faint rings and spikes, or lower it for more contrast in the bright part.`
      ],
      formulas: [
        { tex: R`v=\min\!\left[1,\ \max\!\left(0,\ \frac{\log_{10}I+R}{R}\right)\right]` },
        { note: 'for example $R=5$: black at', tex: R`I=10^{-5}=0.001\,\%\ \text{of the peak}` }
      ],
      see: ['cmap', 'airy', 'profile']
    },

    cmap: {
      title: 'Color map',
      what: 'How the brightness value becomes a colour. Gray, Hot, Inferno, Viridis and Ice are false-colour maps: the same data in different colours.',
      theory: [
        R`The brightness $v$ on the log scale, from 0 to 1, indexes a table of colours. Inferno and Viridis change steadily in lightness, which keeps faint structure readable.`,
        R`"Wavelength color" is different: each wavelength sample gets the hue of that wavelength, and the pixel colour is the average of these hues weighted by brightness. It only illustrates which colour is where. It does not model the spectrum of a source or the response of the eye, so a white star does not come out white.`
      ],
      formulas: [
        { tex: R`{\rm colour}={\rm LUT}(v)` }
      ],
      see: ['range', 'band']
    },

    area: {
      title: 'Light-collecting area',
      what: 'The open area of the mirror divided by the area of a full circle of diameter D. Obstructions, spider vanes and the gaps and hexagonal shape of segments all lower it.',
      theory: [
        R`A bigger collecting area gathers more photons, and the peak of the image grows as the square of it. For a segmented mirror the reference circle is the circle that encloses all segments, so even a perfectly filled hexagonal array has a ratio below 1.`
      ],
      formulas: [
        { tex: R`\frac{A_{\rm open}}{\pi D^{2}/4}` },
        { note: 'central obstruction only', tex: R`1-\epsilon^{2}` },
        { note: '$N$ hexagonal segments of width $f$ between opposite edges', tex: R`A_{\rm open}=N\,\frac{\sqrt3}{2}\,f^{2}` }
      ],
      see: ['eps', 'relpeak', 'seg']
    },

    relpeak: {
      title: 'Peak versus a clear circular telescope',
      what: 'The peak brightness of the image compared with an unobstructed, perfect circular mirror of the same diameter.',
      theory: [
        R`The peak is the squared sum of the light across the aperture, so it grows as the square of the open area. It also falls with the {{strehl|Strehl ratio}} when the wavefront is not perfect.`
      ],
      formulas: [
        { tex: R`\frac{I_{\rm peak}}{I_{\rm peak}^{\rm clear\ circle}}=\left(\frac{A_{\rm open}}{A_{\rm circle}}\right)^{2}S` }
      ],
      see: ['area', 'strehl', 'eps']
    },

    numerics: {
      title: 'Numerical method and limits',
      what: 'How the pattern is computed, and what the sampling limits.',
      theory: [
        R`The aperture is drawn on a grid of 512 × 512 points with the mirror 128 points across, then transformed with a two-dimensional fast Fourier transform (Cooley and Tukey 1965). Rows that are entirely empty are skipped, which saves about a third of the work. Edges of the mirror, the obstruction, the vanes and the segments are sampled finely inside each pixel (16 × 16 for a solid mirror and 8 × 8 for a segmented one), so that a vane thinner than a pixel still blocks the right amount of light.`,
        R`The FFT assumes that the pattern repeats, so light beyond $\pm64\,\lambda/D$ wraps around to the other side. This is negligible for clean apertures and shows up only as faint structure far out. The picture is resampled with bicubic interpolation, which cannot restore a very deep dark ring that falls between samples.`,
        R`The computation runs in a Web Worker when the page can start one, so the sliders stay smooth. With aberrations and a wide band, each of the seven wavelengths needs its own FFT, which takes longer.`
      ],
      formulas: [
        { note: 'sampling and size of the computed field', tex: R`\Delta\theta=\frac{\lambda/D}{4},\qquad {\rm field}=\pm64\,\frac{\lambda}{D}` },
        { note: R`cost of a 2D FFT of $n\times n$ points`, tex: R`\mathcal O\!\left(n^{2}\log n\right)` }
      ],
      refs: [COOLEY, GOODMAN],
      see: ['psf', 'fov', 'profile']
    },

    seg: {
      title: 'Segmented hexagonal mirror',
      what: 'Telescopes much larger than about 8 m cannot be cast in one piece, so Keck, JWST and the ELT build the primary mirror from many hexagonal segments. Switch this on to replace the solid disk by a honeycomb.',
      theory: [
        R`The aperture is a set of identical hexagons on a triangular lattice. The Fourier transform of a sum of identical shifted shapes is the transform of one shape times a sum of phases, one for each segment. So the star image is the pattern of one hexagon (which has six spikes) multiplied by the pattern of the lattice. If the segments are in phase (aligned to a fraction of a wavelength), the result looks like the pattern of one big mirror with a hexagonal outline and the characteristic six spikes.`,
        R`If the segments are not phased, the sharp core fades into a halo of speckles. {{segpiston|Piston}} and {{segtilt|tip and tilt}} errors do this; the {{seggap|gaps}} between segments and an {{segcenter|empty center}} change the pattern more subtly. The {{eps|central obstruction}} and {{vanes|spider vanes}} still apply on top of the segments.`
      ],
      formulas: [
        { tex: R`A(x,y)=\sum_j {\rm hex}(x-x_j,\ y-y_j)` },
        { note: 'transform: shape of one segment times the lattice sum', tex: R`\tilde A(\boldsymbol\theta)=\widetilde{\rm hex}(\boldsymbol\theta)\ \sum_j e^{-i\,2\pi\,\mathbf r_j\cdot\boldsymbol\theta/\lambda}` },
        { note: R`centers of the segments on the lattice, with $p=f+{\rm gap}$`, tex: R`x=p\left(q+\frac r2\right),\qquad y=p\,r\,\frac{\sqrt3}{2}` },
        { note: 'number of segments for $k$ rings', tex: R`N=3k(k+1)+1` }
      ],
      sim: R`$D$ is the diameter of the circle that encloses all the segments. Use the {{segpresets|presets}} for the layouts of real telescopes.`,
      refs: [GARDNER, PERRIN, CHANAN, GOODMAN],
      see: ['segrings', 'seggap', 'segcenter', 'segpiston', 'segtilt', 'segpresets']
    },

    segrings: {
      title: 'Number of rings k',
      what: 'How many hexagonal rings surround the center segment. More rings mean more, smaller segments in the same diameter.',
      theory: [
        R`Ring $j$ holds $6j$ segments, so $k$ rings give $3k(k+1)+1$ in all, or $3k(k+1)$ if the center is {{segcenter|left empty}}. JWST has 2 rings without the center (18 segments) and each Keck telescope has 3 (36).`
      ],
      formulas: [
        { tex: R`N=1+\sum_{j=1}^{k}6j=3k(k+1)+1` },
        { note: 'with the center removed', tex: R`N=3k(k+1)\quad(k=2\to18,\ k=3\to36)` }
      ],
      refs: [GARDNER],
      see: ['seg', 'segcenter', 'segpresets']
    },

    seggap: {
      title: 'Gap between segments',
      what: 'The width of the empty strip between neighbouring segments, as a fraction of the segment width.',
      theory: [
        R`Gaps lose a little light and scatter a small fraction of it into faint spikes along the three directions of the segment edges. Real gaps are tiny (JWST: about 0.5 % of the width), far thinner than one pixel of the computation, so their effect is sampled within each pixel and their scattered light is only approximate.`
      ],
      formulas: [
        { tex: R`g=\gamma\,f,\qquad p=f+g` },
        { note: 'area of one hexagonal segment of width $f$ between opposite edges', tex: R`A_{\rm seg}=\frac{\sqrt3}{2}\,f^{2}` }
      ],
      refs: [PERRIN],
      see: ['seg', 'area', 'numerics']
    },

    segcenter: {
      title: 'Empty center segment',
      what: 'Leaves the middle of the mirror empty, as on JWST and Keck.',
      theory: [
        R`Many segmented telescopes have no central segment: the hole lets the beam pass or holds other hardware. It removes the segment that would have been under the {{eps|secondary mirror}} anyway, and slightly lowers the {{area|collecting area}}.`
      ],
      formulas: [
        { tex: R`N=3k(k+1)` }
      ],
      refs: [GARDNER],
      see: ['seg', 'segrings']
    },

    segpiston: {
      title: 'Segment piston error',
      what: 'Each segment sits a little in front of or behind its ideal position. The errors are random, a different draw for each segment, and are given as RMS wavefront error in waves at the center wavelength.',
      theory: [
        R`Piston errors break the phasing between segments. Each segment adds its light with a random phase, so the sum at the center of the image is weaker: the sharp core shrinks and the light goes into a halo of speckles. The Strehl ratio at the center, averaged over random draws, falls as the Maréchal approximation, with a small correction for a finite number $N$ of segments.`,
        R`A surface offset $s$ gives a wavefront error of $2s$ when light reflects. Phasing a real telescope to a fraction of a wavelength is a major task (Chanan et al. 1998 for Keck). A fixed length is a smaller error in waves at a longer wavelength, which is why segmented telescopes are easier to phase for infrared work.`,
        R`The errors come from a random generator with a seed, so the same seed gives the same errors. "New random draw" changes the seed and keeps the RMS.`
      ],
      formulas: [
        { tex: R`W_j=p_j,\qquad p_j\sim\mathcal N\!\left(0,\sigma_p^{2}\right)` },
        { note: 'mean Strehl ratio at the center, for $N$ equal segments', tex: R`\langle S\rangle=\frac{1}{N}+\left(1-\frac{1}{N}\right)e^{-(2\pi\sigma_p)^{2}}` },
        { note: 'surface to wavefront', tex: R`\sigma_p=2\,\sigma_{\rm surface}` }
      ],
      refs: [CHANAN, MAHAJAN],
      see: ['segtilt', 'strehl', 'seg']
    },

    segtilt: {
      title: 'Segment tip and tilt error',
      what: 'Each segment is also tilted a little about two axes. The value is the RMS of each tilt component, measured as the wavefront change at the edge of a segment, in waves at the center wavelength.',
      theory: [
        R`A tilted segment sends its light to a slightly different place in the image, by an angle equal to the slope of the wavefront across it. So the picture breaks into copies of the single-segment pattern, displaced from each other, and the sharp core fades.`,
        R`Over a regular hexagon the tilt contributes an RMS wavefront error of about $0.745\,\sigma_t$, because the mean square of the normalised coordinate over a hexagon is $5/18$.`
      ],
      formulas: [
        { note: 'wavefront of segment $j$, with $u=x/a$ and $v=y/a$ in units of the apothem $a=f/2$', tex: R`W_j(u,v)=a_j\,u+b_j\,v,\qquad a_j,\,b_j\sim\mathcal N\!\left(0,\sigma_t^{2}\right)` },
        { note: 'RMS over one hexagon', tex: R`\sigma_W=\sigma_t\sqrt{2\cdot\tfrac{5}{18}}=0.745\,\sigma_t` },
        { note: 'displacement of the segment image', tex: R`\Delta\theta=\frac{a_j\,\lambda}{f/2}` }
      ],
      refs: [CHANAN],
      see: ['segpiston', 'seg', 'wavefront']
    },

    segpresets: {
      title: 'Telescope presets',
      what: 'Sets the segment layout of a real telescope, and the diameter and field of view so that the pattern fits the picture. The central obstruction and spider vanes are turned off so that the pattern of the mirror itself is visible.',
      theory: [
        R`JWST has 18 hexagonal segments (2 rings, no center segment), each 1.32 m between opposite edges, in a primary mirror of about 6.5 m (Gardner et al. 2006). A Keck telescope has 36 hexagonal segments (3 rings, no center) in a 10 m mirror. The third preset has 5 rings and 91 segments, a layout of the size class of the extremely large telescopes. Their gaps are set to approximate values.`,
        R`JWST works in the infrared, but the wavelength control here stops at 1000 nm, so the star is shown at visible wavelengths. Perrin et al. (2012) simulate the real PSF of JWST in detail.`
      ],
      formulas: [
        { tex: R`N=3k(k+1)\ \ (k=2:\ 18,\quad k=3:\ 36),\qquad N=3k(k+1)+1\ \ (k=5:\ 91)` }
      ],
      refs: [GARDNER, PERRIN],
      see: ['seg', 'segrings', 'D']
    }
  };

  return { tips, bind, panels, topics };
})();
