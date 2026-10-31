package fr.speedcar.app

/** Pure policy: a relative increase must never lower a volume already above the ceiling. */
object VolumePolicy {
    fun target(current: Int, minimum: Int, maximum: Int, steps: Int, ceilingPercent: Int): Int {
        require(minimum >= 0 && maximum >= minimum)
        require(current in minimum..maximum)
        require(steps in 1..3)
        require(ceilingPercent in 0..100)
        val ceiling = minimum + ((maximum - minimum).toLong() * ceilingPercent / 100).toInt()
        if (current >= ceiling) return current
        return (current.toLong() + steps).coerceAtMost(ceiling.toLong()).toInt()
    }
}
