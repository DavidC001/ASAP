;; domain file: domain-CleanBFS-43.pddl
(define (domain default)
    (:requirements :strips)
    (:predicates
        (time ?param)
        (at ?from)
        (connected ?from ?to)
        (visited ?to)
        (agent ?to ?param)
        (waited0 ?tile)              
    )
    (:action move1
    :parameters (?from ?to)
    :precondition (and (time T1) (at ?from) (connected ?from ?to) (not (visited ?to)) (not (agent ?to T1)) (not (agent ?to T0)))
    :effect (and (not (at ?from)) (at ?to) (visited ?to) (not (time T1)) (time T2))
)
        (:action move2
    :parameters (?from ?to)
    :precondition (and (time T2) (at ?from) (connected ?from ?to) (not (visited ?to)) (not (agent ?to T2)))
    :effect (and (not (at ?from)) (at ?to) (visited ?to))
)
        (:action wait0T1
    :parameters (?tile)
    :precondition (and (time T1) (at ?tile) (not (waited0 ?tile)))
    :effect (and (waited0 ?tile) (not (time T1)) (time T2))
)
        (:action wait0T2
    :parameters (?tile)
    :precondition (and (time T2) (at ?tile) (not (waited0 ?tile)))
    :effect (and (waited0 ?tile))
)
)