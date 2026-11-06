"""Optics math MCP server.

Exposes numerical optics routines (numpy / scipy) to Claude over the Model Context
Protocol, so that focal lengths and diffraction patterns can be checked before the
TypeScript simulation code is written.

Tools
-----
ray_transfer_system    Paraxial ABCD matrix of an optical train (thin lenses + free space).
fraunhofer_1d_slits    Far-field intensity of a 1D aperture (FFT, arbitrary slit layout).
airy_disk              Intensity of a circular aperture's Airy pattern (scipy Bessel J1).

Run:  python3 tools/optics_mcp/server.py      (stdio transport, started by Claude Code)
"""

from __future__ import annotations

import math

import numpy as np
from scipy.special import j1, jn_zeros
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("optics-math")


# --------------------------------------------------------------------------- #
# 1. Paraxial ray transfer (ABCD) analysis
# --------------------------------------------------------------------------- #
def _space(d: float) -> np.ndarray:
    """Free-space propagation over distance d. Ray vector is (height y, angle θ)."""
    return np.array([[1.0, d], [0.0, 1.0]])


def _thin_lens(f: float) -> np.ndarray:
    """Thin lens of focal length f (sign convention: f > 0 converging)."""
    return np.array([[1.0, 0.0], [-1.0 / f, 1.0]])


@mcp.tool()
def ray_transfer_system(
    elements: list[dict],
    unit: str = "m",
) -> dict:
    """Compute the system ABCD matrix of an optical train and its focal properties.

    Args:
        elements: Ordered list in the direction of light travel. Each item is either
            {"type": "lens", "f": <focal length>} or {"type": "space", "d": <distance>}.
        unit: Label for the returned lengths (informational only; inputs must share it).

    Returns:
        matrix: [[A, B], [C, D]] of the whole system.
        effective_focal_length: -1/C. Infinite when C == 0 (afocal system).
        back_focal_distance: -A/C, from the last element to the rear focal point.
        front_focal_distance: -D/C, from the first element to the front focal point.
    """
    M = np.eye(2)
    for el in elements:
        kind = el.get("type")
        if kind == "lens":
            step = _thin_lens(float(el["f"]))
        elif kind == "space":
            step = _space(float(el["d"]))
        else:
            raise ValueError(f"Unknown element type: {kind!r}")
        M = step @ M  # later elements multiply on the left

    A, B = M[0]
    C, D = M[1]
    if abs(C) < 1e-12:
        efl = bfd = ffd = math.inf
    else:
        efl = -1.0 / C
        bfd = -A / C
        ffd = -D / C

    return {
        "matrix": M.tolist(),
        "effective_focal_length": efl,
        "back_focal_distance": bfd,
        "front_focal_distance": ffd,
        "unit": unit,
    }


# --------------------------------------------------------------------------- #
# 2. Fraunhofer diffraction via FFT
# --------------------------------------------------------------------------- #
@mcp.tool()
def fraunhofer_1d_slits(
    slits: list[tuple[float, float]],
    wavelength_nm: float,
    aperture_length_m: float = 2e-3,
    n_samples: int = 2**16,
    max_points: int = 2000,
) -> dict:
    """Far-field intensity of a 1D transmission aperture (Fraunhofer regime).

    The aperture is a set of slits. Each slit is (center_m, width_m), measured from the
    centre of a window of length aperture_length_m. The far field is the Fourier
    transform of the aperture function, with the mapping sinθ = λ · f_x.

    Args:
        slits: List of (center_m, width_m). Example: double slit = [(-2e-5, 1e-5), (2e-5, 1e-5)].
        wavelength_nm: Wavelength in nanometres.
        aperture_length_m: Physical window size. It sets the angular resolution.
        n_samples: FFT size. Larger values give finer angular sampling.
        max_points: Number of samples returned, to keep the response small.

    Returns:
        sin_theta: Sine of the diffraction angle, within [-1, 1].
        intensity: Normalised intensity I/I_max, same length as sin_theta.
        sin_theta_max_resolved: Largest sinθ the sampling can represent, (λN)/(2L).
    """
    lam = wavelength_nm * 1e-9
    L = float(aperture_length_m)
    N = int(n_samples)
    x = (np.arange(N) - N / 2) * (L / N)
    dx = L / N

    field = np.zeros(N)
    for center, width in slits:
        field[np.abs(x - center) <= width / 2] = 1.0

    spectrum = np.fft.fftshift(np.fft.fft(np.fft.ifftshift(field)))
    intensity = np.abs(spectrum) ** 2
    intensity /= intensity.max()

    # Spatial frequency f_x = m / (N dx). Map it to direction via sinθ = λ f_x.
    fx = np.fft.fftshift(np.fft.fftfreq(N, d=dx))
    sin_theta = lam * fx
    keep = np.abs(sin_theta) <= 1.0
    sin_t, inten = sin_theta[keep], intensity[keep]

    step = max(1, sin_t.size // int(max_points))
    return {
        "sin_theta": sin_t[::step].tolist(),
        "intensity": inten[::step].tolist(),
        "sin_theta_max_resolved": lam * N / (2 * L),
    }


# --------------------------------------------------------------------------- #
# 3. Circular aperture (Airy pattern)
# --------------------------------------------------------------------------- #
@mcp.tool()
def airy_disk(
    radius_m: float,
    wavelength_nm: float,
    max_angle_rad: float = 0.01,
    n_points: int = 501,
) -> dict:
    """Normalised Airy intensity I/I0 = [2 J1(x) / x]^2 with x = k a sinθ.

    Args:
        radius_m: Aperture radius a in metres.
        wavelength_nm: Wavelength in nanometres.
        max_angle_rad: Half-width of the angular range to sample.
        n_points: Number of samples across [-max_angle_rad, +max_angle_rad].

    Returns:
        theta_rad, intensity: sampled pattern.
        first_zero_rad: First dark ring, sinθ ≈ 1.22 λ / (2a) (small angle).
    """
    lam = wavelength_nm * 1e-9
    k = 2.0 * math.pi / lam
    theta = np.linspace(-max_angle_rad, max_angle_rad, int(n_points))
    x = k * radius_m * np.sin(theta)

    safe_x = np.where(x == 0.0, 1.0, x)
    intensity = np.where(x == 0.0, 1.0, (2.0 * j1(safe_x) / safe_x) ** 2)

    first_zero_x = float(jn_zeros(1, 1)[0])  # 3.8317…
    first_zero = math.asin(min(1.0, first_zero_x / (k * radius_m)))

    return {
        "theta_rad": theta.tolist(),
        "intensity": intensity.tolist(),
        "first_zero_rad": first_zero,
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")
