;; problem file: problem-lights.pddl
(define (problem default)
    (:domain default)
    (:objects light1 light2 light3)
    (:init (switched-off light1) (switched-off light2))
    (:goal (and (switched-on light1)))
)
