// utils/circularStats.js

/**
 * Calculates the circular mean angle for a list of angles in radians.
 * https://en.wikipedia.org/wiki/Mean_of_circular_quantities
 * @param {number[]} anglesInRadians - Array of angles in radians.
 * @returns {number} The circular mean angle in degrees (0 to 360).
 */
function getCircularMeanAngle(anglesInRadians) {
    if (!anglesInRadians || anglesInRadians.length === 0) {
        return 0; // Or null, depending on how you want to handle empty input
    }

    let sumSin = 0;
    let sumCos = 0;

    for (const angle of anglesInRadians) {
        sumSin += Math.sin(angle);
        sumCos += Math.cos(angle);
    }

    const meanAngleRad = Math.atan2(sumSin, sumCos);
    let meanAngleDeg = meanAngleRad * (180 / Math.PI);

    // Normalize to 0-360 degrees
    if (meanAngleDeg < 0) {
        meanAngleDeg += 360;
    }

    return meanAngleDeg;
}

module.exports = { getCircularMeanAngle };