from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


FunctionName = Literal["step", "sigmoid", "relu", "quadratic"]


class StrictParams(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmptySceneParams(StrictParams):
    pass


class EquationLineParams(StrictParams):
    text: str = Field(min_length=1, max_length=60)
    reveal_at: float = Field(ge=0, le=1)


class EquationBuildParams(StrictParams):
    lines: list[EquationLineParams] = Field(min_length=1, max_length=6)
    highlight_last: bool

    @model_validator(mode="after")
    def lines_reveal_in_order(self) -> "EquationBuildParams":
        reveal_times = [line.reveal_at for line in self.lines]
        if reveal_times != sorted(reveal_times):
            raise ValueError("lines must be ordered by reveal_at")
        return self


class CurveMarkerParams(StrictParams):
    x: float
    label: str = Field(min_length=1, max_length=32)


class CurveDotParams(StrictParams):
    fn: FunctionName
    morph_from: FunctionName | None
    x_min: float = Field(ge=-20, le=20)
    x_max: float = Field(ge=-20, le=20)
    markers: list[CurveMarkerParams] = Field(max_length=8)
    caption: str = Field(min_length=1, max_length=120)

    @model_validator(mode="after")
    def validate_domain_and_markers(self) -> "CurveDotParams":
        if self.x_min >= self.x_max:
            raise ValueError("x_min must be less than x_max")
        if any(not self.x_min <= marker.x <= self.x_max for marker in self.markers):
            raise ValueError("marker x values must be within x_min and x_max")
        return self


class FlowNodeParams(StrictParams):
    id: str = Field(min_length=1, max_length=32, pattern=r"^[a-zA-Z0-9_-]+$")
    label: str = Field(min_length=1, max_length=24)
    value: str = Field(min_length=1, max_length=20)
    x: float = Field(ge=0.08, le=0.92)
    y: float = Field(ge=0.18, le=0.82)


class FlowEdgeParams(StrictParams):
    from_: str = Field(alias="from", min_length=1, max_length=32)
    to: str = Field(min_length=1, max_length=32)

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class FlowBoxesParams(StrictParams):
    nodes: list[FlowNodeParams] = Field(min_length=2, max_length=8)
    edges: list[FlowEdgeParams] = Field(min_length=1, max_length=12)
    order: list[str] = Field(min_length=2, max_length=8)
    caption: str = Field(min_length=1, max_length=120)

    @model_validator(mode="after")
    def validate_path(self) -> "FlowBoxesParams":
        node_ids = [node.id for node in self.nodes]
        if len(set(node_ids)) != len(node_ids):
            raise ValueError("node ids must be unique")
        node_id_set = set(node_ids)
        if any(edge.from_ not in node_id_set or edge.to not in node_id_set for edge in self.edges):
            raise ValueError("every edge endpoint must refer to a node")
        if any(edge.from_ == edge.to for edge in self.edges):
            raise ValueError("edges must connect two different nodes")
        if len(set(self.order)) != len(self.order) or set(self.order) != node_id_set:
            raise ValueError("order must contain every node id exactly once")
        directed_edges = {(edge.from_, edge.to) for edge in self.edges}
        if any(pair not in directed_edges for pair in zip(self.order, self.order[1:])):
            raise ValueError("each consecutive pair in order must have a directed edge")
        return self


TEMPLATE_PARAM_MODELS: dict[str, type[StrictParams]] = {
    "inputs_bounce": EmptySceneParams,
    "bias_node": EmptySceneParams,
    "weights_light": EmptySceneParams,
    "sum_node": EmptySceneParams,
    "gate_fire": EmptySceneParams,
    "sigmoid_curve": EmptySceneParams,
    "weight_update": EmptySceneParams,
    "equation_build": EquationBuildParams,
    "curve_dot": CurveDotParams,
    "flow_boxes": FlowBoxesParams,
}
