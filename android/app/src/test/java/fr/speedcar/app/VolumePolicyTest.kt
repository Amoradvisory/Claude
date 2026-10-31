package fr.speedcar.app

import org.junit.Assert.assertEquals
import org.junit.Test

class VolumePolicyTest {
    @Test fun `one step stays below ceiling`() {
        assertEquals(5, VolumePolicy.target(4, 0, 15, 1, 60))
    }
    @Test fun `several steps stop at ceiling`() {
        assertEquals(9, VolumePolicy.target(8, 0, 15, 3, 60))
    }
    @Test fun `already above ceiling never decreases`() {
        assertEquals(12, VolumePolicy.target(12, 0, 15, 1, 60))
    }
    @Test fun `zero ceiling causes no increase`() {
        assertEquals(0, VolumePolicy.target(0, 0, 15, 1, 0))
    }
    @Test fun `nonzero stream minimum is respected`() {
        assertEquals(7, VolumePolicy.target(6, 5, 15, 3, 20))
    }
    @Test fun `fixed range stays unchanged`() {
        assertEquals(3, VolumePolicy.target(3, 3, 3, 1, 60))
    }
    @Test(expected = IllegalArgumentException::class) fun `rejects out of range current`() {
        VolumePolicy.target(16, 0, 15, 1, 60)
    }
    @Test(expected = IllegalArgumentException::class) fun `rejects negative steps`() {
        VolumePolicy.target(4, 0, 15, -1, 60)
    }
    @Test(expected = IllegalArgumentException::class) fun `rejects invalid ceiling`() {
        VolumePolicy.target(4, 0, 15, 1, 101)
    }
}
